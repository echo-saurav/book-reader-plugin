import {WorkspaceLeaf, FileView, TFile, debounce, Debouncer, Menu} from "obsidian";
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
	//
	private currentCfi: string;
	private isRestoring = false;


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
		this.onSelectionListener(this.rendition);
		//
		this.goLastPage();
		this.loadChapters(book);
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

	onSelectionListener(rendition: Rendition) {
		rendition.on("selected", (cfiRange: string, contents: Contents) => {

			const iframe = this.epubView.querySelector('iframe');
			if (!iframe) return;

			const iframeRect = iframe.getBoundingClientRect();

			const range = rendition.getRange(cfiRange);
			const selectedText = range.toString();
			const rect = range.getBoundingClientRect();

			const centerX = iframeRect.left + rect.left + (rect.width / 2);
			const centerY = iframeRect.top + rect.top;


			console.log(selectedText);
			getContextMenu(
				selectedText,
				() => {
				},
				() => {
				},
				() => {
				},
				() => {
				})
				.showAtPosition({x: centerX, y: centerY}, document);



			// clear selection
			// contents.window.getSelection().removeAllRanges();
		});

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
					style.textContent = await new Response(cssText).text();
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
					style.textContent = await new Response(cssText).text();
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
						const text = await new Response(cssContent).text();
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


