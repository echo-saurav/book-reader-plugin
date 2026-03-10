import {
	WorkspaceLeaf,
	FileView,
	TFile,
	debounce,
	Debouncer,
	Menu,
	ViewStateResult,
	MenuPositionDef,
	setIcon
} from "obsidian";
import ePub, {Book, Contents, Rendition} from 'epubjs';
import BookReader from "./main";
import {ChaptersList, Chapter} from "./ChaptersList";
import {getContextMenu} from "./ContextMenu";

export const VIEW_TYPE_EPUB = "epub"

export class EpubViewer extends FileView {
	navigation = false
	allowNoFile: false;
	//
	private plugin: BookReader;
	private rendition: Rendition;
	private debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;
	private buttonTimeoutReset = 3000
	private debounceHideButton: Debouncer<[], Promise<void>>;

	chapters: Chapter[] = [];
	//views
	private epubContainer: HTMLElement;
	private epubView: HTMLElement;
	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	private chapterMenuButton: HTMLElement;
	private backNavigationButton: HTMLElement;
	private mainMenuButton: HTMLElement;
	//
	private currentCfi: string;
	private currentSelectedCfi: string
	//
	private isRestoring = false;
	private linkHistory: string[] = []


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay * 1000; // convert to minute
		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			await this.plugin.updatePageProgress(file, cfi);
		}, timeout, true);
	}

	autoHideButton() {
		console.log('Auto hide button', this.mainMenuButton.classList);
		// reveal if not visible
		if (this.mainMenuButton.classList.contains('hide-button')) {
			this.mainMenuButton.classList.remove('hide-button');
		}
		this.debounceHideButton();
	}


	createView() {
		this.contentEl.empty();
		//
		this.epubContainer = this.contentEl.createDiv({cls: 'epub-container'});
		this.epubView = this.epubContainer.createDiv({cls: 'epub-view'});
		// buttons
		const buttonStyle = `
			display: block; 
		    width: 100%; 
		    padding: 20px; 
		    margin-bottom: 20px;
		    cursor: pointer;
		`
		// prev chapter
		this.prevButton = document.createElement('button');
		this.prevButton.textContent = "Previous Chapter";
		this.prevButton.style.cssText = buttonStyle;
		// next chapter
		this.nextButton = document.createElement('button');
		this.nextButton.textContent = "Next Chapter";
		this.nextButton.style.cssText = buttonStyle;
		//
		this.chapterMenuButton = this.epubContainer.createEl('button', {cls: 'epub-button chapter-menu'});
		this.backNavigationButton = this.epubContainer.createEl('button', {cls: 'epub-button nav-back'});
		this.mainMenuButton = this.epubContainer.createEl('button', {cls: 'epub-button main-menu'});
		setIcon(this.mainMenuButton,'menu');
		//
		// auto hide button
		// set auto hide after timeout
		this.debounceHideButton = debounce(() => {
			this.mainMenuButton.classList.add('hide-button');
		}, this.buttonTimeoutReset, true);

		this.autoHideButton();
		// button actions
		this.mainMenuButton.addEventListener('click', () => {
			console.log('MainMenu clicked', this.mainMenuButton.classList);
		})


		//
		this.chapterMenuButton.addEventListener('click', async (e) => {
			new ChaptersList(this.app, this.chapters, async (cfi: string) => {
				// const section = this.rendition.book.spine.get(cfi);
				// await this.rendition.display(section.href);
				this.rendition.display(cfi);
			}).open();
		});
		//
		this.backNavigationButton.addEventListener('click', async (e) => {
			// if (this.linkHistory) {
			// 	console.log("got history", this.linkHistory);
			// 	console.log("got history", this.linkHistory[this.linkHistory.length - 1]);
			// 	this.rendition.display(this.linkHistory[this.linkHistory.length - 1]);
			// }

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
					color:null
				}
				//
				bookmarksAsChapter.push(chapter);
			}

			//
			new ChaptersList(this.app, bookmarksAsChapter, async (cfi: string) => {
				this.rendition.display(cfi);
			}).open();

		});

	}


	async onLoadFile(file: TFile) {
		super.load();
		this.file = file;
		if (!file) return;
		//
		this.createView();
		// Read file as binary
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);
		if (!book) return;


		this.rendition = book.renderTo(this.epubView, {
			width: "100%",
			height: "100%",
			allowScriptedContent: true,
			flow: "scrolled",
			manager: "default"
		});

		this.handleResources(this.rendition, book);
		this.applyDefaultTheme(this.rendition);
		this.onPageChangeListener(this.rendition);
		// this.onSelectionListener(this.rendition);
		this.onRender(this.rendition, book);
		//
		this.goToLastReadingPage();
		this.loadChapters(book);
		this.populateHighlight(this.file);

		this.loadBookMap(book);
	}

	getPosition(cfi: string): MenuPositionDef {
		const iframe = this.epubView.querySelector('iframe');
		if (!iframe) return {x: 0, y: 0};

		const iframeRect = iframe.getBoundingClientRect();

		const range = this.rendition.getRange(cfi);
		const rect = range.getBoundingClientRect();

		const centerX = iframeRect.left + rect.left + (rect.width / 2);
		const centerY = iframeRect.top + rect.top;

		return {x: centerX, y: centerY}
	}

	onAddAnnotation(cfiRange: string, color: string) {

		this.rendition.annotations.add('highlight', cfiRange, {}, (ev: any) => {
			const menu = new Menu()

			menu.addItem(item => {
				item.setTitle("Delete").setIcon("delete").onClick(() => {
					this.plugin.deleteHighlight(this.file, cfiRange);
					this.rendition.annotations.remove(cfiRange, 'highlight');
				})
			})
			menu.showAtPosition(this.getPosition(cfiRange), document)
		}, 'highlight', {'fill': color});
	}


	onRender(rendition: Rendition, book: Book) {
		// keep track of pages
		rendition.on("selected", (cfiRange: string, contents: Contents) => {
			this.currentSelectedCfi = cfiRange;
		});

		// after render
		rendition.on('rendered',async (section: any, contents: Contents) => {
			// insert buttons inside iframe
			const doc = contents.document;
			const body = doc.body;
			body.insertBefore(this.prevButton, body.firstChild);
			body.appendChild(this.nextButton);
			//
			this.nextButton.addEventListener('click', () => {
				console.log('NextChapter clicked', this.nextButton.classList);

				this.rendition.next();
			});

			this.prevButton.addEventListener('click', () => {
				this.rendition.prev();
				console.log('PrevChapter clicked', this.prevButton.classList);
			});

			//
			await book.ready
			let totalSections = 0; rendition.book.spine.each(() => totalSections++);

			const prevSection = section.index > 0 ? book.spine.get(section.index - 1) : null;
			const nextSection = section.index < totalSections -1 ? book.spine.get(section.index + 1) : null;


			if(nextSection) {
				this.nextButton.textContent = book.navigation.get(nextSection.href).label
			}else {
				this.nextButton.style.visibility = 'hidden';
			}

			if(prevSection) {
				this.prevButton.textContent = book.navigation.get(prevSection.href).label
			}else {
				this.prevButton.style.visibility = 'hidden';
			}




			contents.document.addEventListener('contextmenu', (ev) => {
				ev.preventDefault();
				// get position
				const iframe = contents.document.defaultView?.frameElement
				const rect = iframe?.getBoundingClientRect();

				const range = rendition.getRange(this.currentSelectedCfi);

				const selectedText = range ? range.toString() : null;


				if (rect) {
					// calculate position
					const x = ev.clientX + rect.left;
					const y = ev.clientY + rect.top;
					// show menu
					getContextMenu(selectedText,
						// highlight
						() => {
							if (!this.file) return;
							// const cfiRange = this.currentSelectedCfi;
							this.plugin.addHighlight(this.file, this.currentSelectedCfi, 'red', selectedText);
							this.onAddAnnotation(this.currentSelectedCfi, 'red');
							contents.window.getSelection()?.removeAllRanges();
							// this.plugin.addHighlight(this.file, cfiRange);
							//
							// rendition.annotations.add('highlight', cfiRange, {}, (ev: any) => {
							// 	const menu = new Menu()
							//
							// 	menu.addItem(item => {
							// 		item.setTitle("Delete").setIcon("delete").onClick(() => {
							// 			this.plugin.deleteHighlight(this.file, cfiRange);
							// 		})
							// 	}).showAtMouseEvent(ev);
							// });
						},
						// bookmark
						async () => {

							const chapterName = this.getChapterNameViaCfi(this.currentCfi, book);
							const pageNo = book.locations.locationFromCfi(this.currentCfi);
							//const progress = book.locations.percentageFromCfi(this.currentCfi) * 100;
							const content = `${chapterName}|${pageNo}`;

							console.log(content);
							this.plugin.addBookmark(this.file, this.currentCfi, content);
						},
						// take note
						() => {
						},
						()=>{},
						).showAtPosition({x, y});
				}
			});

			// link jump history
			contents.document.querySelectorAll('a').forEach(link => {
				link.addEventListener('click', (ev) => {
					const href = link.getAttribute('href');
					if (href && href.indexOf("://") === -1) { // It's an internal link
						ev.preventDefault();
						// rendition.display(href);
						const cfi = rendition.location.start.cfi
						this.linkHistory.push(cfi);

					}
				});
			});

			// Close menu
			contents.document.addEventListener('click', (ev) => {

				this.autoHideButton();
				// reset selection
				this.currentSelectedCfi = ""
				// Create a fake click event to send to the main window
				const newEvent = new MouseEvent('mousedown', {
					view: window,
					bubbles: true,
					cancelable: true,
					clientX: ev.clientX,
					clientY: ev.clientY
				});


				// Dispatch it on the main document so the Menu "hears" it
				window.document.dispatchEvent(newEvent);
			});


			// obsidian key downs
			contents.document.addEventListener('keydown', (ev: KeyboardEvent) => {
				// Create a new event that looks exactly like the one in the iframe
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

				// Dispatch it to the main window
				const handled = !window.dispatchEvent(relayedEvent);

				// If the main window handled it (e.g., a shortcut triggered),
				// prevent the iframe from doing anything with it.
				if (handled) {
					ev.preventDefault();
				}
			});


		});
	}

	getChapterNameViaCfi(cfi: string, book: Book) {
		const section = book.spine.get(cfi);
		const notFound = "No chapter name found"
		if (!section) return notFound
		//
		const href = section.href.split('#')[0];
		const navItem = book.navigation.get(href);

		return navItem ? navItem.label.trim() : notFound;
	}

	async loadBookMap(book: Book) {
		if (!this.file) return

		const chars = 1500
		const epubLocationMap = await this.plugin.getEpubLocationMap(this.file)

		if (epubLocationMap) {
			book.locations.load(epubLocationMap);
		} else {
			await book.locations.generate(chars);
			const generateEpubMap = book.locations.save();
			this.plugin.setEpubLocationMap(this.file, generateEpubMap);
		}

	}

	async getMetadataFromCfi(cfi: string, book: Book) {
		await book.locations.generate(1500);
		const epubMap = book.locations.save();

		const section = book.spine.get(cfi);

		// 2. Look up the Chapter Name in the Table of Contents (Navigation)
		// We split '#' to match the base file name used in the TOC keys
		const href = section ? section.href.split('#')[0] : null;
		const navItem = href ? book.navigation.get(href) : null;

		// Fallback to "Unknown Chapter" if not found in TOC
		const chapter = navItem ? navItem.label.trim() : "Unknown Chapter";

		// 3. Get Page Number (Only works if book.locations.generate(1000) was called)
		const pageNo = book.locations.locationFromCfi(cfi);

		// 4. Get Percentage (0 to 1)
		const progress = book.locations.percentageFromCfi(cfi);


		return {
			chapter: chapter,
			page: pageNo,
			progress: progress ? (progress * 100).toFixed(2) + "%" : "0%",
			cfi: cfi
		};
	}


	async populateHighlight(file: TFile) {
		const allHighlights: string[] = await this.plugin.getAllHighlights(file);
		console.log(allHighlights);

		for (const highlight of allHighlights) {
			const data = highlight.split('|');
			const cfi = data[0];
			const color = data.length == 2 ? data[1] : 'yellow';

			this.onAddAnnotation(cfi, color);

		}
	}


	async goToLastReadingPage() {
		if (!this.file) return;
		const markdownFile = await this.plugin.getMarkdownFile(this.file);
		const metadata = this.plugin.getFrontmatter(markdownFile);

		if (!metadata) {
			console.log('no metadata found');
			await this.rendition.display();
		} else if (metadata && metadata[this.plugin.settings.currentPageRefKey]) {
			await this.rendition.display(metadata[this.plugin.settings.currentPageRefKey]);
			console.log('last', metadata[this.plugin.settings.currentPageRefKey]);
		}
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
				color:null
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
						color:null
					});
				}
			}
		}

		this.chapters = tmpChapters;
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

	applyDefaultTheme(rendition: Rendition) {
		rendition.themes.default({
			"html": {
				"display": "flex",
				"justify-content": "center",
				"background-color": "purple",
				"padding-top": "100px"
			},
			"body": {
				"background-color": "#ffffff",
				"max-width": "700px",
				"margin": "auto"
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

	onPageChangeListener(rendition: Rendition) {
		rendition.on("relocated", async (range: any) => {
			if (this.file == null) return
			if (this.isRestoring) return;

			const cfi = range.start.cfi;
			this.currentCfi = cfi;
			this.debounceUpdatePage(this.file, cfi)
		});
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


