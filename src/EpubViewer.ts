import {WorkspaceLeaf, FileView, TFile, debounce, Debouncer, Menu, ViewStateResult, MenuPositionDef} from "obsidian";
import ePub, {Book, Contents, Rendition} from 'epubjs';
import BookReader from "./main";
import {ChaptersList, Chapter} from "./ChaptersList";
import {getContextMenu} from "./ContextMenu";

export const HOVER_ID = "EpubViewer";
export const VIEW_TYPE_EPUB = "epub"

export class EpubViewer extends FileView {
	private plugin: BookReader;
	private rendition: Rendition;
	private readonly debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;
	//
	allowNoFile: false;
	chapters: Chapter[] = [];
	//view
	private epubContainer: HTMLElement;
	private epubView: HTMLElement;
	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	private chapterMenuButton: HTMLElement;
	private backNavigationButton: HTMLElement;
	//
	private currentCfi: string;
	private currentSelectedCfi: string
	private isRestoring = false;

	navigation = false
	private linkHistory: string[] = []


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay + 5 * 1000; // convert to minute
		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			await this.plugin.updatePage(file, cfi);
		}, timeout, true);
	}

	setEphemeralState(state: any) {
		super.setEphemeralState(state);
		console.log('state', state);
		if (state.subpath && state.subpath.slice(1)) {
			// this.subpath = state.subpath.slice(1);
			this.rendition.display(state.subpath.slice(1));
		}
	}


	createView() {
		this.contentEl.empty();
		//
		this.epubContainer = this.contentEl.createDiv({cls: 'epub-container'});
		this.epubView = this.epubContainer.createDiv({cls: 'epub-view'});
		//
		this.nextButton = this.epubContainer.createEl('button', {cls: 'epub-button next'});
		this.prevButton = this.epubContainer.createEl('button', {cls: 'epub-button prev'});
		this.chapterMenuButton = this.epubContainer.createEl('button', {cls: 'epub-button chapter-menu'});
		this.backNavigationButton = this.epubContainer.createEl('button', {cls: 'epub-button nav-back'});
		//
		this.nextButton.addEventListener('click', async (e) => {
			await this.rendition.next();
		});
		this.prevButton.addEventListener('click', async (e) => {
			await this.rendition.prev();
		});
		//
		this.chapterMenuButton.addEventListener('click', async (e) => {
			new ChaptersList(this.app, this.chapters, async (cfi: string) => {
				// const section = this.rendition.book.spine.get(cfi);
				// await this.rendition.display(section.href);
				this.rendition.display(cfi);
			}).open();
		})
		//
		this.backNavigationButton.addEventListener('click', async (e) => {
			if (this.linkHistory) {
				console.log("got history", this.linkHistory);
				console.log("got history", this.linkHistory[this.linkHistory.length - 1]);
				this.rendition.display(this.linkHistory[this.linkHistory.length - 1]);
			}

		})

	}

	async setState(state: any, result: ViewStateResult): Promise<void> {
		// This is called when Obsidian restores a state (like clicking Back)
		if (state.cfi && state.cfi !== this.currentCfi) {
			this.currentCfi = state.cfi;
			if (this.rendition) {
				await this.rendition.display(state.cfi);
			}
		}

		await super.setState(state, result);
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

		book.locations.generate(1000);

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
		this.goLastPage();
		this.loadChapters(book);
		this.populateHighlight(this.file);
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
		// rendition.on("selected", (cfiRange: string, contents: Contents) => {
		// 	// Just store the range, don't show the menu yet
		// 	this.lastSelectedCfi = cfiRange;
		// });
		rendition.on("selected", (cfiRange: string, contents: Contents) => {
			this.currentSelectedCfi = cfiRange;
		});

		rendition.on('rendered', (section: any, contents: Contents) => {

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

			// Fix for the menu not closing:
			contents.document.addEventListener('click', (ev) => {
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

			contents.document.addEventListener('contextmenu', (ev) => {
				ev.preventDefault();
				// get position
				const iframe = contents.document.defaultView?.frameElement
				const rect = iframe?.getBoundingClientRect();

				const range = rendition.getRange(this.currentSelectedCfi);
				const selectedText = range.toString();


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
							this.plugin.addHighlight(this.file, this.currentSelectedCfi, 'red');
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
							// book.locations.generate(1000);
							const meta = await this.getMetadataFromCfi(this.currentCfi,book);
							console.log(meta);

							const chapterName = book.navigation.get(this.currentCfi).label
							const pageNo = book.locations.locationFromCfi(this.currentCfi);
							const progress = book.locations.percentageFromCfi(this.currentCfi);
							const content = `${progress} ${chapterName}: ${pageNo}`;
							// const content = `${this.currentCfi} ${progress} ${pageNo}`;
							console.log(content);
							this.plugin.addBookmark(this.file, this.currentCfi, content);
						},
						// take note
						() => {
						}).showAtPosition({x, y});
				}
			});


		});
	}


	onPageChangeListener(rendition: Rendition) {
		rendition.on("relocated", async (range: any) => {
			if (this.file == null) return
			if (this.isRestoring) return;


			console.log(`Relocated file: ${range.start.cfi}`);
			const cfi = range.start.cfi;
			this.currentCfi = cfi;
			// await this.plugin.updatePage(this.file, cfi);
			this.debounceUpdatePage(this.file, cfi)
		});
	}

	async getMetadataFromCfi(cfi:string, book:Book) {
		await book.locations.generate(1500);
		const map = book.locations.save();

		console.log(map);

		// 1. Get the Section (Spine Item) that contains this CFI
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


	onSelectionListener(rendition: Rendition) {
		if (!this.file) return;
		rendition.on("selected", (cfiRange: string, contents: Contents) => {
			this.currentSelectedCfi = cfiRange;

			const iframe = this.epubView.querySelector('iframe');
			if (!iframe) return;

			const iframeRect = iframe.getBoundingClientRect();

			const range = rendition.getRange(cfiRange);
			const selectedText = range.toString();
			const rect = range.getBoundingClientRect();

			const centerX = iframeRect.left + rect.left + (rect.width / 2);
			const centerY = iframeRect.top + rect.top;


			getContextMenu(
				selectedText,
				// highlight
				() => {
					if (!this.file) return;
					this.plugin.addHighlight(this.file, cfiRange, 'yellow');
					this.onAddAnnotation(cfiRange, 'yellow');
					contents.window.getSelection()?.removeAllRanges();

					// rendition.annotations.add('highlight', cfiRange, {}, () => {
					// 	console.log("Highlight clicked!", cfiRange);
					// 	const menu = new Menu();
					// 	menu.addItem(item => {
					// 		item.setTitle("Delete")
					// 			.setIcon("trash")
					// 			.onClick(() => {
					// 				if (!this.file) return;
					// 				this.plugin.deleteHighlight(this.file, cfiRange);
					// 				this.rendition.annotations.remove(cfiRange, 'highlight');
					// 			})
					// 	});
					//
					//
					// 	//
					// 	const iframe = this.epubView.querySelector('iframe');
					// 	if (!iframe) return;
					//
					// 	const iframeRect = iframe.getBoundingClientRect();
					//
					// 	const range = this.rendition.getRange(cfiRange);
					// 	const selectedText = range.toString();
					// 	const rect = range.getBoundingClientRect();
					//
					// 	const centerX = iframeRect.left + rect.left + (rect.width / 2);
					// 	const centerY = iframeRect.top + rect.top;
					//
					// 	menu.showAtPosition({x: centerX, y: centerY}, document);
					// });
					//

				},
				// bookmark
				() => {
				},
				// take note
				() => {
				}).showAtPosition({x: centerX, y: centerY}, document);


			// clear selection
			// contents.window.getSelection().removeAllRanges();
		});

	}

	async populateHighlight(file: TFile) {
		const allHighlights: string[] = await this.plugin.getAllHighlights(file);
		console.log(allHighlights);

		for (const highlight of allHighlights) {
			const data = highlight.split('|');
			const cfi = data[0];
			const color = data.length == 2 ? data[1] : 'yellow';

			this.onAddAnnotation(cfi, color);

			// this.rendition.annotations.add('highlight', cfi, {}, (e: any) => {
			// 	const data = highlight.split('|');
			// 	const cfi = data[0];
			// 	const color = data.length == 2 ? data[1] : 'yellow';
			//
			// 	console.log(`cfi: ${cfi}, color: ${color}, highlight: ${highlight}`);
			// 	this.onAddAnnotation(cfi, color);
			//
			// 	// console.log("Highlight clicked!", highlight);
			// 	// const menu = new Menu();
			// 	// menu.addItem(item => {
			// 	// 	item.setTitle("Delete")
			// 	// 		.setIcon("trash")
			// 	// 		.onClick(() => {
			// 	// 			this.plugin.deleteHighlight(file, highlight);
			// 	// 			this.rendition.annotations.remove(highlight, 'highlight');
			// 	// 		})
			// 	// });
			// 	//
			// 	//
			// 	// //
			// 	// const iframe = this.epubView.querySelector('iframe');
			// 	// if (!iframe) return;
			// 	//
			// 	// const iframeRect = iframe.getBoundingClientRect();
			// 	//
			// 	// const range = this.rendition.getRange(highlight);
			// 	// const selectedText = range.toString();
			// 	// const rect = range.getBoundingClientRect();
			// 	//
			// 	// const centerX = iframeRect.left + rect.left + (rect.width / 2);
			// 	// const centerY = iframeRect.top + rect.top;
			// 	//
			// 	// menu.showAtPosition({x: centerX, y: centerY}, document);
			// },'highlight',{'fill': color});
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
			}
		});
	}

	async goLastPage() {
		// go to page from link
		// if (this.subpath) {
		// 	await this.rendition.display(this.subpath);
		// 	console.log('go to page from link',this.subpath);
		// 	return;
		// }

		if (!this.file) return;
		const metadata = this.plugin.getFrontmatter(this.file);
		if (!metadata) {
			await this.rendition.display();
		}
		if (metadata?.cfi) {
			await this.rendition.display(metadata.cfi);
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
				type: "parent"
			});
			// add sub toc
			if (toc.subitems) {
				for (const subToc of toc.subitems) {
					tmpChapters.push({
						href: subToc.href,
						label: subToc.label,
						id: subToc.id,
						parent: toc.label,
						type: "sub"
					});
				}
			}
		}

		this.chapters = tmpChapters;
	}


	async xonLoadFile(file: TFile) {
		super.load();
		this.file = file;
		if (!file) return;

		console.log(`Loaded file: ${file.basename}`);
		this.createView();

		// Read file as binary
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);

		this.rendition = book.renderTo(this.epubView, {
			width: "100%",
			height: "100%",
			allowScriptedContent: true,

			flow: "scrolled",
			manager: "default"
		});


		this.rendition.hooks.content.register(async (contents: Contents) => {
			// const style = document.createElement('style');
			// style.textContent = `
			// 	body {
			// 		background-color: red !important;
			// 	}`;
			// contents.document.head.appendChild(style);

			const doc = contents.document;

			// 1. Get all CSS files from the manifest

			const manifest = book.packaging.manifest;
			const cssFiles = Object.values(manifest).filter(item => item.type === 'text/css');

			for (const file of cssFiles) {
				// 2. Load the actual CSS text from the EPUB
				const cssText = await book.load(file.href);
				if (cssText) {
					// 3. Inject it as a style tag (which bypasses protocol blocks)
					const style = doc.createElement('style');
					style.textContent = await new Response(cssText.toString()).text();
					doc.head.appendChild(style);
				}
			}
		});
		this.rendition.themes.default({
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
			}
		});

		await this.rendition.display();

		await this.goLastPage();
		this.loadChapter();
		// update page no on scroll
		this.rendition.on("relocated", async (range: any) => {
			if (this.file == null) return
			if (this.isRestoring) return;


			console.log(`Relocated file: ${range.start.cfi}`);
			const cfi = range.start.cfi;
			this.currentCfi = cfi;
			// await this.plugin.updatePage(this.file, cfi);
			this.debounceUpdatePage(this.file, cfi)
		});

		this.rendition.on("selected", (cfiRange: string, contents: any) => {
			// this.rendition.annotations.add("highlight", cfiRange, {}, (e: any) => {
			// 	console.log("Highlight clicked!", cfiRange);
			// },'highlight',{'background': 'red !important','opacity':1});

			// Mark (invisible area, useful for invisible click targets)
			// this.rendition.annotations.mark(cfiRange, {}, (e) => {
			// 	console.log("You clicked a marked word");
			// 	this.addHighlight(cfiRange);
			// });
			this.addHighlight(cfiRange)
			// contents.window.getSelection().removeAllRanges();
		});


		// this.app.workspace.on('resize', async () => {
		// 	await this.onLoadFile(this.file);
		//
		// });
		// this.app.workspace.on('active-leaf-change', async () => {
		// 	await this.onLoadFile(this.file);
		// });
		return super.onLoadFile(file);
	}

	addHighlight(cfiRange: string) {
		// The 4th argument in .add() is the click callback
		// this.rendition.annotations.add("highlight", cfiRange, {}, (e: MouseEvent) => {
		// 	console.log("mouse", `${e.x} and ${e.y}`);
		// 	this.showAnnotationMenu(e, cfiRange);
		// });
		// this.showAnnotationMenu(e, cfiRange);

		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Copy CFI Range")
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(cfiRange);
				})
		);

		menu.addItem((item) =>
			item
				.setTitle("Delete Highlight")
				.setIcon("trash")
				.setWarning(true)
				.onClick(() => {
					this.rendition.annotations.remove(cfiRange, "highlight");
					// Also remember to remove it from your persistent storage!
					// this.myPluginSettings.removeHighlight(cfiRange);
				})
		);

		const iframe = this.epubView.querySelector('iframe');
		if (!iframe) return;

		const iframeRect = iframe.getBoundingClientRect();

		const range = this.rendition.getRange(cfiRange);
		const rect = range.getBoundingClientRect();
		// const iframeRect = iframe.getBoundingClientRect();

		const centerX = iframeRect.left + rect.left + (rect.width / 2);
		const centerY = iframeRect.top + rect.top;
		console.log(`xx: ${centerY}, ${centerX}`);
		menu.showAtPosition({x: centerX, y: centerY}, document);
	}

	showAnnotationMenu(e: MouseEvent, cfiRange: string) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Copy CFI Range")
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(cfiRange);
				})
		);

		menu.addItem((item) =>
			item
				.setTitle("Delete Highlight")
				.setIcon("trash")
				.setWarning(true)
				.onClick(() => {
					this.rendition.annotations.remove(cfiRange, "highlight");
					// Also remember to remove it from your persistent storage!
					// this.myPluginSettings.removeHighlight(cfiRange);
				})
		);

		// Show the menu at the mouse coordinates
		// menu.showAtMouseEvent(e);
		const iframe = this.epubView.querySelector('iframe');
		if (!iframe) return;

		const iframeRect = iframe.getBoundingClientRect();

		const range = this.rendition.getRange(cfiRange);
		const rect = range.getBoundingClientRect();
		// const iframeRect = iframe.getBoundingClientRect();

		const centerX = iframeRect.left + rect.left + (rect.width / 2);
		const centerY = iframeRect.top + rect.top;
		console.log(`xx: ${centerY}, ${centerX}`);
		menu.showAtPosition({x: centerX, y: centerY}, document);

		this.app.workspace.trigger('mouseenter', {
			event: e,
			source: HOVER_ID,
			hoverParent: this,
			targetEl: iframe, // The iframe acts as the 'source' element
			// linktext: this.file?.path,
			linktext: "Existentialism. md",
			coordinate: {x: centerX, y: centerY}
		});

	}


	loadChapter() {
		this.rendition.book.ready.then(async () => {
			const book = this.rendition.book;
			const tmpChapters: Chapter[] = [];

			for (const toc of book.navigation.toc) {
				tmpChapters.push({
					href: toc.href,
					label: toc.label,
					id: toc.id,
					parent: toc.parent,
					type: "parent"
				});
				// add sub toc
				if (toc.subitems) {
					for (const subToc of toc.subitems) {
						tmpChapters.push({
							href: subToc.href,
							label: subToc.label,
							id: subToc.id,
							parent: toc.label,
							type: "sub"
						});
					}
				}
			}

			this.chapters = tmpChapters;

			const manifest = book.packaging.manifest;
			const cssFiles = Object.values(manifest).filter(item => item.type === 'text/css');

			console.log("Found CSS files:", cssFiles);
			console.table(cssFiles);

			// 2. Fetch and log the actual CSS content
			for (const file of cssFiles) {
				try {
					// use book.load to get the resource (returns a Blob or string depending on version)
					const cssContent = await book.load(file.href);

					console.log(`--- Content of: ${file.href} ---`);

					if (typeof cssContent === 'string') {
						console.log(cssContent);
					} else {
						// If it returns a Blob/Buffer, convert it to text

						const text = await new Response(cssContent.toString()).text();
						console.log(text);
					}
				} catch (err) {
					console.error(`Could not load CSS file: ${file.href}`, err);
				}
			}

			console.log(this.chapters);
		})
	}

	// Use Obsidian's resize hook to detect tab focus
	onResize() {
		super.onResize();
		// When the tab becomes visible, Obsidian calls onResize.
		// We wait a tiny bit for epub.js to settle, then force our saved position.
		if (this.currentCfi) {
			this.restorePosition();
		}
	}

	private async restorePosition() {
		this.isRestoring = true;
		await this.rendition.display(this.currentCfi);
		// Wait for the move to finish before allowing new "relocated" events
		setTimeout(() => {
			this.isRestoring = false;
		}, 200);
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}


}


