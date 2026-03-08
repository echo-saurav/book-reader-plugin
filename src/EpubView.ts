import {
	debounce,
	Debouncer,
	FileView,
	Menu,
	MenuPositionDef,
	setIcon,
	TFile,
	ViewStateResult,
	WorkspaceLeaf
} from "obsidian";
import BookReader from "./main";
import ePub, {Book, Contents, Rendition} from "epubjs";
import {Chapter, ChaptersList} from "./ChaptersList";
import Section from "epubjs/types/section";
import {getContextMenu} from "./ContextMenu";


export const VIEW_TYPE_EPUB = "epub"

export class EpubView extends FileView {
	navigation = false
	allowNoFile: false;
	//
	private plugin: BookReader;
	private rendition: Rendition;
	private buttonTimeoutReset = 1000 * 10;
	private debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;
	private debounceHideButton: Debouncer<[], Promise<void>>;

	chapters: Chapter[] = [];
	//views
	private epubContainer: HTMLElement;
	private epubView: HTMLElement;
	private menuContainer: HTMLElement;
	private buttonContainer: HTMLElement;
	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	// buttons
	private addBookmarkButton: HTMLElement;
	private chapterMenuButton: HTMLElement;
	private bookmarksMenuButton: HTMLElement;
	private highlightsMenuButton: HTMLElement;
	private notesMenuButton: HTMLElement;

	//
	private pageInfo: HTMLElement;
	private pageSize = 1024

	private backNavigationButton: HTMLElement;
	private mainMenuButton: HTMLElement;
	//
	private currentCfi: string;
	private currentSelectedCfi: string | null;
	//
	private isRestoring = false;
	private linkHistory: string[] = []


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay + 5 * 1000; // convert to minute
		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			await this.plugin.updatePageProgress(file, cfi);
		}, timeout, true);
	}

	createView() {
		this.contentEl.empty();
		//
		this.epubContainer = this.contentEl.createDiv({cls: 'epub-container'});
		this.epubView = this.epubContainer.createDiv({cls: 'epub-view'});
		// ui buttons
		this.menuContainer = this.epubContainer.createEl('div', {cls: 'menu-container'});
		this.buttonContainer = this.menuContainer.createEl('div', {cls: 'button-container'});

		// back navigation
		this.backNavigationButton = this.buttonContainer.createEl('button',
			{cls: 'small-button'}
		);
		setIcon(this.backNavigationButton, 'undo-2');


		// add bookmark
		this.addBookmarkButton = this.buttonContainer.createEl('button', {
			text: 'Add bookmark',
			cls: 'big-button '
		});
		const addBookmarkIcon = createEl('div');
		setIcon(addBookmarkIcon, 'bookmark-plus');
		this.addBookmarkButton.prepend(addBookmarkIcon);

		// chapter
		this.chapterMenuButton = this.buttonContainer.createEl('button', {
			text: 'Chapters',
			cls: 'big-button '
		});
		const chapterIcon = createEl('div');
		setIcon(chapterIcon, 'table-of-contents');
		this.chapterMenuButton.prepend(chapterIcon);

		// bookmark
		this.bookmarksMenuButton = this.buttonContainer.createEl('button', {
			text: 'Bookmarks',
			cls: 'big-button '
		});
		const bookmarkIcon = createEl('div');
		setIcon(bookmarkIcon, 'bookmark');
		this.bookmarksMenuButton.prepend(bookmarkIcon);

		// highlight
		this.highlightsMenuButton = this.buttonContainer.createEl('button', {
			text: 'Highlights',
			cls: 'big-button '
		})
		const highlightIcon = createEl('div');
		setIcon(highlightIcon, 'highlighter');
		this.highlightsMenuButton.prepend(highlightIcon);

		// note
		this.notesMenuButton = this.buttonContainer.createEl('button', {
			text: 'Notes',
			cls: 'big-button '
		});
		const notesIcon = createEl('div');
		setIcon(notesIcon, 'pencil');
		this.notesMenuButton.prepend(notesIcon);

		// page information
		this.pageInfo = this.epubContainer.createEl('div', {text: '100', cls: 'page-info'});

		// epub buttons
		const buttonStyle = `
			display: block; 
		    width: 100%; 
		    padding: 20px; 
		    margin-bottom: 50px;
		    cursor: pointer;
		    background: var(--button-color);
		    color: var(--button-text-color);
		    border: none;
		    box-shadow: none;
		    font-weight: bold;
		    font-size: var(--h1-size);
		`
		// prev chapter
		this.prevButton = document.createElement('button');
		this.prevButton.textContent = "Previous Chapter";
		this.prevButton.style.cssText = buttonStyle;
		// next chapter
		this.nextButton = document.createElement('button');
		this.nextButton.textContent = "Next Chapter";
		this.nextButton.style.cssText = buttonStyle;

		// auto hide button
		// set auto hide after timeout
		this.debounceHideButton = debounce(() => {
			this.menuContainer.classList.add('hide-button');
			this.pageInfo.classList.add('hide-button');

		}, this.buttonTimeoutReset, true);

		// click listeners
		this.chapterMenuButton.addEventListener('click', async (e) => {
			new ChaptersList(this.app, this.chapters, async (cfi: string) => {
				// const section = this.rendition.book.spine.get(cfi);
				// await this.rendition.display(section.href);
				this.pushHistory(this.currentCfi);
				this.rendition.display(cfi);

			}).open();
		});

		this.backNavigationButton.addEventListener('click', async (e) => {
			if (this.linkHistory.length > 0 && this.rendition) {
				const lastCfi = this.linkHistory[this.linkHistory.length - 1];
				console.log(lastCfi)
				this.rendition.display(lastCfi);
				this.linkHistory.remove(lastCfi);
				this.restBackNavigationButton();
			}
		});

		this.bookmarksMenuButton.addEventListener('click', async (e) => {
			this.showBookmarks();
		})
		this.highlightsMenuButton.addEventListener('click', async (e) => {
			this.showHighlights();
		})


		this.autoHideButton();
		this.hideNavOnScroll();


	}

	async showHighlights() {
		if (!this.file) return;
		const highlights: string[] = await this.plugin.getAllHighlights(this.file);

		const highlightAsChapter: Chapter[] = [];
		for (const highlight of highlights) {
			const parts = highlight.split('|');
			const cfi = parts[0];
			const color = parts[1];
			const content = parts[2];
			const chapter: Chapter = {
				id: highlight,
				label: `${content}`,
				href: cfi,
				parent: undefined,
				type: "parent",
				color: color
			}
			//
			highlightAsChapter.push(chapter);
		}
		new ChaptersList(this.app, highlightAsChapter, async (cfi: string) => {
			this.rendition.display(cfi);
		}).open();
	}


	async showBookmarks() {
		if (!this.file) return;
		const bookmarks: string[] = await this.plugin.getAllBookmarks(this.file);
		const bookmarksAsChapter: Chapter[] = [];
		for (const bookmark of bookmarks) {
			const parts = bookmark.split('|');
			const cfi = parts[0];
			const label = parts[1];
			const pageNo = parts[2];
			const chapter: Chapter = {
				id: bookmark,
				label: `${label} ${pageNo}`,
				href: cfi,
				parent: undefined,
				type: "parent",
				color: null
			}
			//
			bookmarksAsChapter.push(chapter);
		}
		new ChaptersList(this.app, bookmarksAsChapter, async (cfi: string) => {
			this.rendition.display(cfi);
		}).open();
	}

	restBackNavigationButton() {
		// hide back nav
		if (this.linkHistory.length > 0) {
			this.backNavigationButton.style.display = 'flex';
		} else {
			this.backNavigationButton.style.display = 'none';
		}
	}


	autoHideButton() {

		this.restBackNavigationButton();

		// reveal if not visible
		if (this.menuContainer.classList.contains('hide-button')) {
			this.menuContainer.classList.remove('hide-button');
		}

		if (this.pageInfo.classList.contains('hide-button')) {
			this.pageInfo.classList.remove('hide-button');
		}

		this.debounceHideButton();
	}


	hideNavOnScroll() {
		// .is-hidden-nav .mobile-navbar{
		// --hidden-nav-navbar-transform: translateY(calc(var(--navbar-height) + var(--navbar-bottom-offset)))
		// }
		//
		// .is-phone.is-hidden-nav .view-header{
		// 	--hidden-nav-offset:
		// 	calc(var(--view-header-height) + var(--view-header-top-offset))}
	}


	async onLoadFile(file: TFile) {
		this.file = file;
		this.createView();
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);
		if (!book) return;


		// load book
		this.rendition = book.renderTo(this.epubView, {
			width: "100%",
			height: "100%",
			allowScriptedContent: true,
			flow: "scrolled",
			manager: "default"
		});
		await book.ready
		this.loadBookMap(book);
		this.applyDefaultTheme(this.rendition);
		this.rendition.on('rendered', async (section: Section, contents: Contents) => {
			if (!this.file) return

			this.onMouseClick(contents);
			this.loadChapters(book);
			this.handleLinkClick(this.rendition, contents);
			this.redirectHotkeys(contents);
			this.appendBackPrevButton(this.rendition, section, book, contents);
			this.setContextMenu(contents, book);
			//
			this.populateHighlight(this.file);

		});
		this.goToLastReadingPage();
		this.handleResources(this.rendition, book);
		this.onPageChangeListener(this.rendition);
		this.onSelectionListener(this.rendition);

		return super.onLoadFile(file);
	}

	async loadBookMap(book: Book) {
		if (!this.file) return

		const epubLocationMap = await this.plugin.getEpubLocationMap(this.file)

		if (epubLocationMap) {
			book.locations.load(epubLocationMap);
		} else {
			await book.locations.generate(this.pageSize);
			const generateEpubMap = book.locations.save();
			this.plugin.setEpubLocationMap(this.file, generateEpubMap);
		}

	}

	appendBackPrevButton(rendition: Rendition, section: Section, book: Book, contents: Contents) {
		const doc = contents.document;
		const body = doc.body;
		//
		const nextChapterLabel = this.getNextChapter(rendition, section, book);
		const prevChapterLabel = this.getPrevChapter(rendition, section, book);
		//
		if (prevChapterLabel) {
			this.prevButton.textContent = `<< ${prevChapterLabel}`;
			body.insertBefore(this.prevButton, body.firstChild);
		}
		if (nextChapterLabel) {
			this.nextButton.textContent = `${nextChapterLabel} >>`;
			body.appendChild(this.nextButton);
		}

		// add padding at bottom
		const bottomPadding = document.createElement('div');
		bottomPadding.style.height = '200px';
		body.appendChild(bottomPadding);

		//
		this.nextButton.addEventListener('click', () => {
			this.rendition.next();
		});

		this.prevButton.addEventListener('click', () => {
			this.rendition.prev();
		});
	}

	getChapterName(book: Book, cfi: string) {
		const section = book.spine.get(cfi);
		const href = section.href.split('#')[0];
		const navItem = book.navigation.get(href);


		if (navItem && navItem.label) {
			return navItem.label;
		}
		return null

	}

	getNextChapter(rendition: Rendition, section: Section, book: Book) {
		let totalSections = 0;
		rendition.book.spine.each(() => totalSections++);

		const nextSection = section.index < totalSections - 1 ? book.spine.get(section.index + 1) : null;
		if (nextSection) {
			return book.navigation.get(nextSection.href).label
		}
		return null
	}

	getPrevChapter(rendition: Rendition, section: Section, book: Book) {
		let totalSections = 0;
		rendition.book.spine.each(() => totalSections++);

		const prevSection = section.index > 0 ? book.spine.get(section.index - 1) : null;
		if (prevSection) {
			return book.navigation.get(prevSection.href).label
		}
		return null
	}


	onPageChangeListener(rendition: Rendition) {
		rendition.on("relocated", async (range: any) => {
			if (this.file == null) return
			if (this.isRestoring) return;

			const cfiStart = range.start.cfi;
			const cfiEnd = range.end.cfi;
			this.currentCfi = cfiStart;
			this.debounceUpdatePage(this.file, cfiStart);
			this.updateProgressUI(rendition.book, cfiEnd);
		});
	}

	updateProgressUI(book: Book, cfi: string) {
		if (!book) return;
		if (!book.locations) return;

		const progressString = book.locations.percentageFromCfi(cfi);
		const progress = Math.round(Number(progressString) * 100);
		//
		const pageNo = book.locations.locationFromCfi(cfi);
		const totalPages = book.locations.length();
		this.pageInfo.innerText = `${pageNo} of ${totalPages} | ${progress}%`;
	}

	onSelectionListener(rendition: Rendition) {
		rendition.on("selected", (cfiRange: string, contents: Contents) => {

			this.currentSelectedCfi = cfiRange;

		});
	}

	getCurrentSelectedText(contents: Contents) {
		const text = contents.document.getSelection();
		if (text) {
			return text.toString().trim();
		}
		return '';

	}

	onMouseClick(contents: Contents) {
		let isDragging = false;

		contents.document.addEventListener('mousedown', () => isDragging = false);
		contents.document.addEventListener('mousemove', () => isDragging = true);

		// mouse dragging and select fix
		contents.document.addEventListener('mouseup', () => {
			if (!isDragging) {
				// stationary click
				this.autoHideButton();
			} else {
				// selection or drag
			}
		});


		// clear selection on click
		contents.document.addEventListener('click', (ev) => {
			// if (this.currentSelectedCfi) {
			// 	this.currentSelectedCfi = null;
			// }

			const newEvent = new MouseEvent('mousedown', {
				view: window,
				bubbles: true,
				cancelable: true,
				clientX: ev.clientX,
				clientY: ev.clientY
			});
			window.document.dispatchEvent(newEvent);
		});

	}


	handleLinkClick(rendition: Rendition, contents: Contents) {
		// link jump history
		contents.document.querySelectorAll('a').forEach(link => {
			link.addEventListener('click', (ev) => {
				const href = link.getAttribute('href');
				if (href && href.indexOf("://") === -1) { // It's an internal link
					ev.preventDefault();
					// rendition.display(href);
					const cfi = rendition.location.start.cfi
					this.pushHistory(cfi);

				}
			});
		});
	}

	setContextMenu(contents: Contents, book: Book) {
		contents.document.addEventListener('contextmenu', (ev) => {
			ev.preventDefault();

			const iframe = contents.document.defaultView?.frameElement
			const rect = iframe?.getBoundingClientRect();


			const x = ev.clientX + (rect ? rect.left : 0);
			const y = ev.clientY + (rect ? rect.top : 0);

			console.log('selected', this.getCurrentSelectedText(contents));
			getContextMenu(this.getCurrentSelectedText(contents),
				// highlight
				() => {
					if (this.currentSelectedCfi) {
						this.plugin.addHighlight(
							this.file,
							this.currentSelectedCfi,
							'red',
							this.getCurrentSelectedText(contents)
						);
						this.onAddAnnotation(this.currentSelectedCfi, 'red');
						contents.window.getSelection()?.removeAllRanges();
					}

				},
				// bookmark
				() => {
					const chapterName = this.getChapterName(book, this.currentCfi);
					const pageNo = book.locations.locationFromCfi(this.currentCfi);
					const content = `${chapterName}|${pageNo}`;
					this.plugin.addBookmark(this.file, this.currentCfi, content);
				},
				// notes
				() => {

				}
			).showAtPosition({x, y});


		})
	}


	redirectHotkeys(contents: Contents) {
		contents.document.addEventListener('keydown', (ev: KeyboardEvent) => {

			const relayedEvent = new KeyboardEvent(ev.type, {
				key: ev.key,
				code: ev.code,
				location: ev.location,
				ctrlKey: ev.ctrlKey,
				shiftKey: ev.shiftKey,
				altKey: ev.altKey,
				metaKey: ev.metaKey,
				repeat: ev.repeat,
				bubbles: true,
				cancelable: true,
			});

			const handled = !window.dispatchEvent(relayedEvent);

			if (handled) {
				ev.preventDefault();
			}
		});
	}

	pushHistory(cfi: string) {
		this.linkHistory.push(cfi);
		// show back button
		this.backNavigationButton.style.display = 'flex'
	}


	applyDefaultTheme(rendition: Rendition) {
		const rootStyles = getComputedStyle(this.contentEl);
		const bgColor = rootStyles.getPropertyValue('--background-primary').trim();
		const textColor = rootStyles.getPropertyValue('--text-normal').trim();
		const h1Size = rootStyles.getPropertyValue('--h1-size').trim();

		rendition.themes.default({
			"html": {
				"display": "flex",
				"justify-content": "center",
				"background-color": bgColor,
				"padding-top": "100px",
				"color": textColor,
				"--button-color": bgColor,
				"--button-text-color": textColor,
				"--h1-size": h1Size,
			},
			"body": {
				"max-width": "700px",
				"margin": "auto",
			},
			"span": {
				"font-size": "20px"
			},
			"p": {
				"font-size": "20px"
			},
			".page-top-bar": {
				"height": "50px",
			}
		});
	}

	async populateHighlight(file: TFile) {
		const allHighlights: string[] = await this.plugin.getAllHighlights(file);
		console.log(allHighlights);

		for (const highlight of allHighlights) {
			console.log(highlight);
			const data = highlight.split('|');
			const cfi = data[0];
			const color = data.length == 2 ? data[1] : 'yellow';

			this.onAddAnnotation(cfi, color);

		}
	}

	onAddAnnotation(cfiRange: string, color: string) {

		console.log(`cfiRange : ${cfiRange}, color: ${color}`);
		this.rendition.annotations.add('highlight', cfiRange, {}, (ev: any) => {
			const menu = new Menu()

			menu.addItem(item => {
				item.setTitle("Delete").setIcon("delete").onClick(() => {
					this.plugin.deleteHighlight(this.file, cfiRange);
					this.rendition.annotations.remove(cfiRange, 'highlight');
				})
			})
			menu.showAtPosition(this.getPosition(cfiRange), document);
		}, 'highlight', {'fill': color, 'opacity': .5});
	}

	getPosition(cfiRange: string): MenuPositionDef {
		const iframe = this.epubView.querySelector('iframe');
		if (!iframe) return {x: 0, y: 0};

		const iframeRect = iframe.getBoundingClientRect();

		const range = this.rendition.getRange(cfiRange);
		const rect = range.getBoundingClientRect();

		const centerX = iframeRect.left + rect.left + (rect.width / 2);
		const centerY = iframeRect.top + rect.top;

		return {x: centerX, y: centerY}
	}


	async goToLastReadingPage() {
		if (!this.file) return;
		const markdownFile = await this.plugin.getMarkdownFile(this.file);
		const metadata = this.plugin.getFrontmatter(markdownFile);

		if (!metadata) {
			// console.log('no metadata found');
			await this.rendition.display();
		} else if (metadata && metadata[this.plugin.settings.currentPageRefKey]) {
			await this.rendition.display(metadata[this.plugin.settings.currentPageRefKey]);
		}
	}

	handleResources(rendition: Rendition, book: Book) {
		rendition.hooks.content.register(async (contents: Contents) => {
			const doc = contents.document;
			//
			const manifest = book.packaging.manifest;
			const cssFiles = Object.values(manifest).filter(item => item.type === 'text/css');

			for (const file of cssFiles) {
				const cssText = await book.load(file.href);
				if (cssText) {
					const style = doc.createElement('style');
					style.textContent = await new Response(cssText.toString()).text();
					doc.head.appendChild(style);
				}
			}
		})
	}

	async loadChapters(book: Book) {
		const tmpChapters: Chapter[] = [];
		await book.ready

		for (const toc of book.navigation.toc) {
			tmpChapters.push({
				href: toc.href,
				label: toc.label,
				id: toc.id,
				parent: toc.parent,
				type: "parent",
				color: null
			});
			// add sub toc
			if (toc.subitems) {
				for (const subToc of toc.subitems) {
					tmpChapters.push({
						href: subToc.href,
						label: subToc.label,
						id: subToc.id,
						parent: toc.label,
						type: "sub",
						color: null
					});
				}
			}
		}

		this.chapters = tmpChapters;
	}


	// Use Obsidian's resize hook to detect tab focus
	onResize() {
		super.onResize();
		if (this.currentCfi) {
			this.restorePosition();
		}
	}

	async restorePosition() {
		this.isRestoring = true;
		await this.rendition.display(this.currentCfi);
		setTimeout(() => {
			this.isRestoring = false;
		}, 200);
	}


	async setState(state: any, result: ViewStateResult): Promise<void> {
		if (state.cfi && state.cfi !== this.currentCfi) {
			this.currentCfi = state.cfi;
			if (this.rendition) {
				await this.rendition.display(state.cfi);
			}
		}

		await super.setState(state, result);
	}

	setEphemeralState(state: any) {
		super.setEphemeralState(state);

		if (state.subpath && state.subpath.slice(1)) {
			this.rendition.display(state.subpath.slice(1));
		}
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

}
