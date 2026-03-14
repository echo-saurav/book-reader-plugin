import {debounce, Debouncer, FileView, Menu, Platform, setIcon, TFile, ViewStateResult, WorkspaceLeaf} from "obsidian";
import BookReader from "./main";
import ePub, {Book, Contents, Rendition} from "epubjs";
import {Chapter, ChaptersList} from "./ChaptersList";
import Section from "epubjs/types/section";
import {getContextMenu} from "./ContextMenu";


export const VIEW_TYPE_EPUB = "epub"

export class EpubView extends FileView {
	navigation = true
	allowNoFile: false;
	//
	private plugin: BookReader;
	private rendition: Rendition;
	private buttonTimeoutReset = 1000 * 10;
	private debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;
	private debounceHideButton: Debouncer<[], Promise<void>>;
	private debounceRenderDisplay: Debouncer<[cfi: string], Promise<void>>;

	chapters: Chapter[] = [];
	//views
	private epubContainer: HTMLElement;
	private epubView: HTMLElement;
	private menuContainer: HTMLElement;
	private buttonContainer: HTMLElement;
	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	private loading: HTMLElement;
	// buttons
	private backNavigationButton: HTMLElement;
	private addBookmarkButton: HTMLElement;
	private chapterMenuButton: HTMLElement;
	private bookmarksMenuButton: HTMLElement;
	private highlightsMenuButton: HTMLElement;
	private notesMenuButton: HTMLElement;
	//
	private pageInfo: HTMLElement;
	private pageSize = 1024
	//
	private currentCfi: string;
	private passedCfi: string;
	private currentSelectedCfi: string | null;
	//
	private isRestoring = false;
	private linkHistory: string[] = []


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay * 1000; // convert to minute
		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			console.log('updating progress', cfi);
			await this.plugin.updatePageProgress(file, cfi);
		}, timeout, true);

		this.debounceRenderDisplay = debounce(async (cfi: string) => {
			if (this.rendition)
				await this.rendition.display(cfi);
		}, 3000, true);
	}

	createView() {
		this.contentEl.empty();
		//
		this.epubContainer = this.contentEl.createDiv({cls: 'epub-container'});
		this.epubView = this.epubContainer.createDiv({cls: 'epub-view'});
		// loading
		this.loading = this.epubContainer.createDiv({cls: 'loading'});
		this.loading.innerText = 'Initial loading could take some time , Please wait. Loading...';
		this.loading.style.display = 'flex';


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
				console.log('go to', cfi);
				await this.rendition.display(cfi);
				this.pushHistory(this.currentCfi);
			}).open();
		});

		this.backNavigationButton.addEventListener('click', async (e) => {
			if (this.linkHistory.length > 0 && this.rendition) {
				const lastCfi = this.linkHistory[this.linkHistory.length - 1];
				console.log(lastCfi)
				await this.rendition.book.ready
 				await this.rendition.display(lastCfi);
				this.rendition.once("rendered", () => {
					this.rendition.display(lastCfi);
				});
				// this.debounceRenderDisplay(lastCfi);
				// await this.rendition.display(lastCfi);
				this.linkHistory.remove(lastCfi);
				this.restBackNavigationButton();
			}
		});

		this.addBookmarkButton.addEventListener('click', async (e) => {
			const pageNo = this.rendition.book.locations.locationFromCfi(this.currentCfi);
			const chapterName = this.getChapterName(this.rendition.book, this.currentCfi);
			const content = `${chapterName}|${pageNo}`;
			this.plugin.addBookmark(this.file, this.currentCfi, content);
		})

		this.bookmarksMenuButton.addEventListener('click', async (e) => {
			this.showBookmarks();
		})
		this.highlightsMenuButton.addEventListener('click', async (e) => {
			this.showHighlights();
		})


		this.autoHideButton();


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
		} else {
			this.menuContainer.classList.add('hide-button');
		}

		if (this.pageInfo.classList.contains('hide-button')) {
			this.pageInfo.classList.remove('hide-button');
		} else {
			this.pageInfo.classList.add('hide-button');
		}

		this.debounceHideButton();
	}


	hideNavOnScroll(contents: Contents) {

		let touchStartY = 0;
		let touchEndY = 0;

		contents.document.body.addEventListener('touchstart', e => {
			touchStartY = e.changedTouches[0].screenY;
		}, {passive: true});

		contents.document.body.addEventListener('touchmove', e => {
			touchEndY = e.changedTouches[0].screenY;

			const threshold = 10;

			// down
			if (touchStartY > touchEndY + threshold) {
				if (!document.body.classList.contains('is-hidden-nav')) {
					document.body.classList.add('is-hidden-nav');
				}
			}
			// up
			else if (touchStartY < touchEndY - threshold) {
				document.body.classList.remove('is-hidden-nav');
			}
			touchStartY = touchEndY;
		}, {passive: true});

	}


	async onLoadFile(file: TFile) {
		console.log(`Loaded ${file}`);
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
		await this.loadBookMap(book);
		this.applyDefaultTheme(this.rendition);
		await this.rendition.display();
		//
		this.handleResources(this.rendition, book);
		this.onPageChangeListener(this.rendition);
		this.onSelectionListener(this.rendition);
		//
		await this.goToLastReadingPage();

		this.rendition.on('rendered', async (section: Section, contents: Contents) => {
			if (!this.file) return


			console.log(`Loaded ${section}`);
			this.loading.style.display = 'none';

			this.hideNavOnScroll(contents);
			this.onMouseClick(contents);
			this.overrideTouchSwipe(contents);
			this.loadChapters(book);
			this.handleLinkClick(this.rendition, contents);
			this.redirectHotkeys(contents);
			this.appendBackPrevButton(this.rendition, section, book, contents);
			this.setContextMenu(contents, book);
			//
			this.populateHighlight(this.file);


		});


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
		return ""

	}

	getNextChapter(rendition: Rendition, section: Section, book: Book) {
		let totalSections = 0;
		rendition.book.spine.each(() => totalSections++);

		if (section.index < totalSections - 1) {
			const nextSection = book.spine.get(section.index + 1);
			if (nextSection) {
				const navItem = book.navigation.get(nextSection.canonical) ||
					book.navigation.get(nextSection.href);
				if (navItem) {
					return navItem.label.trim();
				}
				return nextSection.idref || `Chapter ${nextSection.index + 1}`;
			}
		}

		return null
	}


	getPrevChapter(rendition: Rendition, section: Section, book: Book) {
		let totalSections = 0;
		rendition.book.spine.each(() => totalSections++);


		if (section.index > 0) {
			const prevSection = book.spine.get(section.index - 1);
			if (prevSection) {
				const navItem = book.navigation.get(prevSection.canonical) ||
					book.navigation.get(prevSection.href);

				if (navItem && navItem.label) {
					return navItem.label.trim();
				}
				return prevSection.idref || `Chapter ${prevSection.index}`;
			}
		}
		return null;
	}

	onPageChangeListener(rendition: Rendition) {
		const timeout = 1000;
		const debounceUpdatePage = debounce((book: Book) => {
			this.updateProgressUI(book);
		}, timeout, true);

		rendition.on("relocated", async (location: any) => {
			if (this.file == null) return
			if (this.isRestoring) return;

			const cfiStart = location.start.cfi;
			const cfiEnd = location.end.cfi;
			this.currentCfi = cfiStart;
			this.debounceUpdatePage(this.file, rendition.currentLocation().cfi);

			// this.updateProgressUI(rendition.book);

			debounceUpdatePage(this.rendition.book);
		});
	}

	updateProgressUI(book: Book) {
		if (!book) return;
		if (!book.locations) return;

		// const progressString = book.locations.percentageFromCfi(cfi);
		// const progress = Math.round(Number(progressString) * 100);
		// //
		// const pageNo = book.locations.locationFromCfi(cfi);
		// const totalPages = book.locations.length();
		// const content = `${pageNo} of ${totalPages} | ${progress}%`;
		// console.log('update', content)
		// console.log("cfi", cfi);
		// this.pageInfo.innerText = pageNo.toString();
		//
		const currentLocation = this.rendition.currentLocation();
		const sectionIndex = (currentLocation as any).start.index;
		const sectionPages = (currentLocation as any).start.displayed.total;
		const sectionBaseCFI = book.spine.get(sectionIndex).cfiBase;

		const sectionStartLocation = (book.locations as any)._locations.findIndex((item: any) =>
			item.startsWith("epubcfi(" + sectionBaseCFI)
		);
		const sectionLocations = (book.locations as any)._locations.filter((item: any) =>
			item.startsWith("epubcfi(" + sectionBaseCFI)
		).length;

		const totalLocations = book.locations.length();
		const estPages = Math.round((totalLocations * sectionPages) / sectionLocations);
		const estSectionStartPage =
			estPages * (sectionStartLocation / totalLocations);
		const estCurrentPage =
			Math.round(estSectionStartPage + (currentLocation as any).start.displayed.page);

		const progress = Math.round((estCurrentPage / estPages) * 100);

		console.log('estCurrentPage', estCurrentPage);
		this.pageInfo.innerText = `${estCurrentPage} of ${estPages} | ${progress}%`;

	}

	onSelectionListener(rendition: Rendition) {
		rendition.on("selected", (cfiRange: string, contents: Contents) => {
			this.currentSelectedCfi = cfiRange;
			console.log('on select', this.currentSelectedCfi);
		});
	}

	getCurrentSelectedText(contents: Contents) {
		const text = contents.document.getSelection();
		if (text) {
			return text.toString().trim();
		}
		return '';

	}


	overrideTouchSwipe(contents: Contents) {
		let touchStartX = 0;
		let touchStartY = 0;
		let touchEndX = 0;
		let touchEndY = 0;

		contents.document.body.addEventListener('touchstart', e => {
			touchStartX = e.changedTouches[0].screenX;
		});

		contents.document.body.addEventListener('touchend', e => {
			touchEndX = e.changedTouches[0].screenX;
			touchEndY = e.changedTouches[0].screenY;

			contents.document.getSelection();
			const selection = contents.window.getSelection();
			const selectedText = selection ? selection.toString() : null;

			if (!selectedText) {
				this.handleGesture(touchStartX, touchEndX, touchStartY, touchEndY);
			} else {
				console.error('selected', selectedText);
				this.showMenu(contents, this.rendition.book, {x: 0, y: 0});
			}

		});

		contents.document.body.addEventListener('touchcancel', e => {
			this.currentSelectedCfi = null;
		});

	}

	handleGesture(startX: number, endX: number, startY: number, endY: number) {
		const dx = endX - startX;
		const dy = endY - startY;

		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		const ratio = absDy === 0 ? absDx : absDx / absDy;

		const toggleLeft = "app:toggle-left-sidebar";
		const toggleRight = "app:toggle-right-sidebar";


		let isIntentional = false;

		if (absDx > 100) {
			// High distance = High confidence
			isIntentional = true;
		} else if (absDx > 50 && ratio > 2.0) {
			// Small distance = Needs high horizontal-to-vertical ratio
			isIntentional = true;
		}

		if (isIntentional) {
			if (dx < 0) {
				console.log('Swipe Left confirmed (Ratio: ' + ratio.toFixed(2) + ')');
				(this.plugin.app as any).commands.executeCommandById(toggleRight);
			} else {
				console.log('Swipe Right confirmed (Ratio: ' + ratio.toFixed(2) + ')');
				(this.plugin.app as any).commands.executeCommandById(toggleLeft);
			}
		}
	}

	onMouseClick(contents: Contents) {
		let isDragging = false;

		contents.document.addEventListener('mousedown', (e: MouseEvent) => {
			isDragging = false;
			this.redirectMouseGesture(contents, e, 'mousedown');
		});
		contents.document.addEventListener('mousemove', (e: MouseEvent) => {
			isDragging = true;
			this.redirectMouseGesture(contents, e, 'mousemove');
		});

		// mouse dragging and select fix
		contents.document.addEventListener('mouseup', (e: MouseEvent) => {
			if (!isDragging) {
				// stationary click
				this.autoHideButton();
			} else {
				// selection or drag
			}
			this.redirectMouseGesture(contents, e, 'mouseup');
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
					// const cfi = rendition.location.start.cfi
					// this.pushHistory(cfi);
					this.pushHistory(this.currentCfi);

				}
			});
		});
	}

	setContextMenu(contents: Contents, book: Book) {
		contents.document.addEventListener('contextmenu', (ev) => {
			ev.preventDefault();

			if (Platform.isDesktop || Platform.isTablet) {
				const iframe = contents.document.defaultView?.frameElement
				const rect = iframe?.getBoundingClientRect();


				const x = ev.clientX + (rect ? rect.left : 0);
				const y = ev.clientY + (rect ? rect.top : 0);

				this.showMenu(contents, book, {x, y});

			}
		})
	}

	showMenu(contents: Contents, book: Book, position: { x: number, y: number }) {

		getContextMenu(this.getCurrentSelectedText(contents),
			// highlight
			async () => {
				console.log(this.currentSelectedCfi);
				if (this.currentSelectedCfi) {
					this.onAddAnnotation(this.currentCfi, 'red');
					contents.window.getSelection()?.removeAllRanges();
					this.currentSelectedCfi = null;

					await this.plugin.addHighlight(
						this.file,
						this.currentCfi,
						'red',
						this.getCurrentSelectedText(contents)
					);
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

			},
			// cancel
			() => {
				// this.currentSelectedCfi = null;
				// contents.window.getSelection()?.removeAllRanges();
			}
		).showAtPosition(position);
	}

	redirectMouseGesture(contents: Contents, e: MouseEvent, type: string) {
		// 1. Get iframe position relative to Obsidian window
		const rect = contents.document?.defaultView?.frameElement?.getBoundingClientRect();

		// 2. Create a fake event with "offset" coordinates
		// This makes the parent think the mouse is at the correct screen position
		const forwardedEvent = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: e.clientX + (rect ? rect.left : 0),
			clientY: e.clientY + (rect ? rect.top : 0),
			buttons: e.buttons,
			which: e.which
		});

		// 3. Dispatch it to the parent (the Obsidian container)
		window.parent.document.dispatchEvent(forwardedEvent);
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
		const linkColor = rootStyles.getPropertyValue('--link-color').trim();

		// rendition.themes.default({
		// 	"html": {
		// 		"display": "flex",
		// 		"justify-content": "center",
		// 		"background-color": bgColor,
		// 		"padding-top": "100px",
		// 		"color": textColor,
		// 		"--button-color": bgColor,
		// 		"--button-text-color": textColor,
		// 		"--h1-size": h1Size,
		// 	},
		// 	"body": {
		// 		"max-width": "700px",
		// 		"margin": "auto",
		// 		"padding": "13px !important",
		// 	},
		// 	"span": {
		// 		"font-size": "20px"
		// 	},
		// 	"p": {
		// 		"font-size": "20px"
		// 	},
		// 	".page-top-bar": {
		// 		"height": "50px",
		// 	}
		// });
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
				"padding": "13px !important",
			},
			".page-top-bar": {
				"height": "50px",
			},
			"span": {
				"font-size": "23px !important"
			},
			"p": {
				"font-size": "23px !important"
			},
			"a": {
				"color": linkColor,
			}
		});
	}

	async populateHighlight(file: TFile) {
		const allHighlights: string[] = await this.plugin.getAllHighlights(file);

		for (const highlight of allHighlights) {
			// console.log(highlight);
			const data = highlight.split('|');
			const cfi = data[0];
			const color = data[1] ? data[1] : 'yellow';

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

	getPosition(cfiRange: string) {
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
		if (this.passedCfi) {
			await this.rendition.display(this.passedCfi);
			await this.rendition.display(this.passedCfi);
			this.loading.style.display = 'none';
			return;
		} else {
			const markdownFile = await this.plugin.getMarkdownFile(this.file);
			const metadata = this.plugin.getFrontmatter(markdownFile);


			if (!metadata) {
				console.log('no metadata found');
				await this.rendition.display();
				this.loading.style.display = 'none';
			} else if (metadata && metadata[this.plugin.settings.currentPageRefKey]) {
				const cfi = metadata[this.plugin.settings.currentPageRefKey];
				console.log('loading page', cfi);
				await this.rendition.display(cfi);
				this.debounceRenderDisplay(cfi);
				// await this.rendition.display(cfi);
				// await this.rendition.display(cfi);
				this.loading.style.display = 'none';
			}
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

		for (const toc of book.navigation.toc) {
			//
			// const item = book.spine.get(toc.href);
			// let cfi = toc.href;
			// if(item){
			// 	cfi = item.canonical;
			// }

			const item = book.spine.get(toc.href);

			let target: string;

			if (item && item.cfiBase) {
				// 2. Construct a valid CFI manually
				// We add "!" to indicate the end of the spine reference
				target = `epubcfi(${item.cfiBase}!/4/2/2)`;
			} else {
				// Fallback to canonical href if spine lookup fails
				target = book.canonical(toc.href);
			}

			tmpChapters.push({
				// href: toc.href,
				href: target,
				label: toc.label,
				id: toc.id,
				parent: toc.parent,
				type: "parent",
				color: null
			});
			// add sub toc
			if (toc.subitems) {
				for (const subToc of toc.subitems) {

					const item = book.spine.get(toc.href);

					let target: string;


					if (item && item.cfiBase) {
						// 2. Construct a valid CFI manually
						// We add "!" to indicate the end of the spine reference
						target = `epubcfi(${item.cfiBase}!/4/2/2))`;
					} else {
						// Fallback to canonical href if spine lookup fails
						target = book.canonical(toc.href);
					}

					tmpChapters.push({
						// href: subToc.href,
						href: target,
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
	// onResize() {
	// 	super.onResize();
	// 	if (this.currentCfi) {
	// 		this.restorePosition();
	// 	}
	// }

	async restorePosition() {
		this.isRestoring = true;
		await this.rendition.display(this.currentCfi);
		setTimeout(() => {
			this.isRestoring = false;
		}, 200);
	}


	// async setState(state: any, result: ViewStateResult): Promise<void> {
	// 	if (state.cfi && state.cfi !== this.currentCfi) {
	// 		this.currentCfi = state.cfi;
	// 		if (this.rendition) {
	// 			await this.rendition.display(state.cfi);
	// 		}
	// 	}
	//
	// 	console.log('set state', state);
	// 	await super.setState(state, result);
	// }

	setState(state: any, result: ViewStateResult) {
		// if (this.currentCfi) {
		// 	return super.setState(null, result);
		// } else {
		// 	return super.setState(state, result);
		// }

		console.log("setstate", state);
		return super.setState(state, result);
	}

	setEphemeralState(state: any) {
		super.setEphemeralState(state);


		if (state.subpath && state.subpath.slice(1)) {
			this.passedCfi = state.subpath.slice(1);

			//
			const delayJump = debounce(async () => {
				await this.rendition.display(this.passedCfi);
				this.debounceRenderDisplay(this.passedCfi);
			}, 1000);

			delayJump();


		}
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

}
