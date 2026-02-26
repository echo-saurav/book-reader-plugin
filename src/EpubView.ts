import {WorkspaceLeaf, FileView, TFile, debounce, IconName, setIcon, Debouncer} from "obsidian";
import ePub, {Book, NavItem, Rendition} from 'epubjs';
import BookReader from "./main";
import {ChapterModal} from "./ChapterModal"; // Ensure you import the default export
export const VIEW_TYPE_EPUB = "epub"

export class EpubView extends FileView {
	allowNoFile: false;
	chapters: NavItem[] = [];
	private debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;

	private rendition: Rendition
	private plugin: BookReader;

	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	private lastRefButton: HTMLElement;
	private chapterButton: HTMLElement;
	private saveBookmarkButton: HTMLElement;
	private showBookmarkButton: HTMLElement;
	private currentlyBookmark: HTMLElement;


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay * 1000; // convert to minute

		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			await this.plugin.updatePage(file, cfi);
		}, timeout, true)
	}

	createView(container: HTMLElement): HTMLElement {
		container.empty();

		// Create a wrapper div
		const epubDiv = container.createEl('div', {cls: 'epub-view'});

		// const nextButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__next-button', 'epub-button']}
		// );
		// const prevButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__previous-button', 'epub-button']}
		// );


		const menuContainer = epubDiv.createEl('div',
			{cls: 'epub-menu-container'}
		);
		// set all buttons
		this.lastRefButton = epubDiv.createEl('div',
			{cls: ['last-ref-button', 'epub-button']}
		);
		setIcon(this.lastRefButton, 'undo-2');

		this.currentlyBookmark = menuContainer.createEl('div',
			{cls: ['epub-button', 'current-bookmark']}
		);
		setIcon(this.currentlyBookmark, 'bookmark-check')
		// this.currentlyBookmark.style.display = 'none';

		this.chapterButton = menuContainer.createEl('div',
			{cls: 'epub-button'}
		);
		setIcon(this.chapterButton, 'menu');
		this.saveBookmarkButton = menuContainer.createEl('div',
			{cls: 'epub-button'}
		);
		setIcon(this.saveBookmarkButton, 'bookmark-plus');
		this.showBookmarkButton = menuContainer.createEl('div',
			{cls: 'epub-button'}
		);
		setIcon(this.showBookmarkButton, 'album');

		const bottomBar = epubDiv.createEl('div',
			{cls: 'epub-view-bottom-bar'}
		);
		bottomBar.createEl('p', {text: "Page no 10"});


		return epubDiv
	}

	runRendition(book: Book, epubDiv: HTMLElement, height: number) {
		console.log(`run: ${height}`)
		this.rendition = book.renderTo(epubDiv, {
			width: "100%",
			// height: `${height}px`,
			height: "686px",
			allowScriptedContent: true,
			flow: "scrolled" // Options: "paginated" or "scrolled-doc"
			// flow: "paginated",
			// manager: "continuous"
		});
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.file = file;
		// Read file as binary
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);

		this.contentEl.empty();
		const epubDiv = this.contentEl.createEl('div', {cls: 'epub-view'});
		console.log("epubDiv.offsetHeight", epubDiv.innerHeight);

		this.rendition = book.renderTo(epubDiv, {
			width: "100%",
			height: `${this.containerEl.offsetHeight}px`,
			// height: "100%",
			allowScriptedContent: true,
			flow: "scrolled", // Options: "paginated" or "scrolled-doc"
			// flow: "paginated",
			manager: "continuous"
		});
		this.setTheme();
		await this.setupPages();
		// await this.parseChapter(book);
		// this.setListeners();

		this.rendition.on("relocated", async (range: any) => {
			console.log(range);
			if (this.file == null) return
			//
			const cfi = range.start.cfi;
			// await this.plugin.updatePage(this.file, cfi);
			this.debounceUpdatePage(this.file, cfi)
		})


		return super.onLoadFile(file);
	}

	onResize() {
		super.onResize();
		console.log("onrezie", this.contentEl.innerHeight);

	}

	async onLoadFiles(file: TFile): Promise<void> {
		this.file = file;
		const container = this.contentEl;
		container.empty();
		const parentDiv = this.contentEl.createEl('div', {cls: 'epub-view-container'});
		const epubDiv = this.createView(parentDiv)

		// Read file as binary
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);

		// observe the height changes
		const resizeTimeout = 1000;

		const delayResize = debounce((height: number) => {
			this.runRendition(book, epubDiv, height);
			// this.rendition = book.renderTo(epubDiv, {
			// 	width: "100%",
			// 	height: height,
			// 	allowScriptedContent: true,
			// 	flow: "scrolled" // Options: "paginated" or "scrolled-doc"
			// 	// flow: "paginated",
			// 	// manager: "continuous"
			// });
		}, resizeTimeout, true);

		if (!this.rendition) {
			this.runRendition(book, epubDiv, parentDiv.offsetHeight)
		}

		const ro = new ResizeObserver((entries) => {
			const height = entries[0].contentRect.height
			console.log("height", height);
			delayResize(height)
		});

		ro.observe(parentDiv);


		// this.rendition = book.renderTo(epubDiv, {
		// 	width: "100%",
		// 	height: "796.78125",
		// 	allowScriptedContent: true,
		// 	flow: "scrolled" // Options: "paginated" or "scrolled-doc"
		// 	// flow: "paginated",
		// 	// manager: "continuous"
		// });

		this.setTheme();
		await this.setupPages();
		await this.parseChapter(book);
		this.setListeners();

		return super.onLoadFile(file);
	}

	setListeners() {

		this.rendition.on("relocated", async (range: any) => {
			console.log(range);
			if (this.file == null) return
			//
			const cfi = range.start.cfi;
			await this.plugin.updateFileData(this.file, null, cfi);
			this.debounceUpdatePage(this.file, cfi)
		})

		// selections
		const onSelected = (range: any) => {
			console.log("selected", range);
			this.rendition.annotations.add("highlight", range, {
				fill: "red",
			})
		}
		this.rendition.on("selected", onSelected);

		// buttons
		this.chapterButton.addEventListener('click', () => {
			new ChapterModal(this.app, this.chapters, null,
				async (chapterRef: NavItem) => {
					if (this.file == null) return
					const currentRef: any = this.rendition.currentLocation()

					console.log("currentRef", currentRef.start.cfi)
					await this.plugin.updateFileData(this.file, null, currentRef.start.cfi)
					await this.rendition.display(chapterRef.href)
				})
				.open();
		});
		this.lastRefButton.addEventListener('click', async () => {
			if (this.file == null) return
			const ref = this.plugin.getOldBookRef(this.file)
			if (ref != null) {
				await this.rendition.display(ref)
			}
		})
		//
		if (this.nextButton && this.prevButton) {
			this.nextButton.addEventListener('click', async () => {
				await this.rendition.next();

			})

			this.prevButton.addEventListener('click', async () => {
				await this.rendition.prev();
			})
		}

	}

	async setupPages() {
		if (this.file == null) return
		const pageRef = await this.plugin.getBookPageRef(this.file)

		if (pageRef) {
			await this.rendition.display(pageRef);
		} else {
			await this.rendition.display();
		}

	}

	setTheme() {
		this.rendition.themes.default({
			html: {
				"padding": "100px 0 0 0 !important"
			},
			body: {
				"font-family": "var(--font-text)",
				"color": "var(--h1-color)",
				"line-height": "1.6",

			},
			p: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--text-normal')};`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--font-default')}!important;`,
				// "font-size": `${getComputedStyle(document.body).getPropertyValue('--font-ui-medium')};`,
				"line-height": `${getComputedStyle(document.body).getPropertyValue('--line-height')};`,
			}
		})

	}

	async parseChapter(book: Book) {
		await book.ready;
		const toc = book.navigation.toc;


		toc.forEach((chapter, i) => {
			// console.log(chapter);
			this.chapters.push(chapter)
		});
	}


	protected onOpen(): Promise<void> {
		return super.onOpen();
	}


	async onClose() {
		// Nothing to clean up.
	}

	canAcceptExtension(extension: string): boolean {
		return extension == VIEW_TYPE_EPUB
	}

	getIcon(): IconName {
		return "album";
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

	onunload() {
		super.onunload();
	}

}
