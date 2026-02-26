import {WorkspaceLeaf, FileView, TFile, debounce, Debouncer} from "obsidian";
import ePub, {NavItem, Rendition} from 'epubjs';
import BookReader from "./main";

export const VIEW_TYPE_EPUB = "epub"

export class EpubViewer extends FileView {
	allowNoFile: false;
	chapters: NavItem[] = [];
	//
	private plugin: BookReader;
	private rendition: Rendition;
	private readonly debounceUpdatePage: Debouncer<[file: TFile, cfi: any], Promise<void>>;
	//view
	private epubContainer: HTMLElement;
	private epubView: HTMLElement;
	private epubButton: HTMLElement;
	//
	private subpath: string;


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;

		const timeout = this.plugin.settings.updateDelay * 1000; // convert to minute
		this.debounceUpdatePage = debounce(async (file: TFile, cfi: any) => {
			await this.plugin.updatePage(file, cfi);
		}, timeout, true);

		this.setResizeListener();
	}

	setEphemeralState(state: any) {
		super.setEphemeralState(state);
		console.log('state', state);
		if (state.subpath) {
			this.subpath = state.subpath.slice(1);
			console.log('subpath', this.subpath);
		}

	}


	createView() {
		this.contentEl.empty();

		this.epubContainer = this.containerEl.createEl('div', {cls: 'epub-container'});
		this.epubView = this.epubContainer.createEl('div', {cls: 'epub-view'});
		this.epubButton = this.epubContainer.createEl('button', {cls: 'epub-button'});
	}


	async onLoadFile(file: TFile) {
		super.load();
		this.file = file;
		// Read file as binary
		const contents = await this.app.vault.readBinary(file);
		// Load the book with URL
		const book = ePub(contents);
		this.createView();

		//
		this.rendition = book.renderTo(this.epubView, {
			width: "100%",
			// height: `${this.containerEl.innerHeight}px`,
			height: "100%",
			allowScriptedContent: true,
			flow: "scrolled", // Options: "paginated" or "scrolled-doc"
			// flow: "scrolled-doc", // Options: "paginated" or "scrolled-doc"
			// flow: "paginated",
			// manager: "continuous"
			manager: "default"
		});

		this.setTheme();
		await this.setupPages();

		this.rendition.on('relocated', async (range: any) => {
			console.log('relocated relocated page', range);

		});

		this.rendition.on('resize', async (range: any) => {
			console.log('resize', range);

		});

		// update page no on scroll
		// this.rendition.on("relocated", async (range: any) => {
		// 	if (this.file == null) return
		// 	//
		// 	const cfi = range.start.cfi;
		// 	// await this.plugin.updatePage(this.file, cfi);
		// 	this.debounceUpdatePage(this.file, cfi)
		// });
		//
		return super.onLoadFile(file);
	}


	setResizeListener() {
		// render page on resize
		this.app.workspace.on('resize', async () => {
			if (this.file) {
				await this.onLoadFile(this.file);
			}
		});


		// this.app.workspace.on('active-leaf-change', async () => {
		// 	if (this.file) {
		// 		await this.onLoadFile(this.file);
		// 	}
		// });
		//
		// this.app.workspace.on('layout-change', async () => {
		// 	if (this.file) {
		// 		await this.onLoadFile(this.file);
		// 	}
		// });

	}


	async setupPages() {
		if (this.file == null) return
		await this.rendition.display();
		// if (this.subpath) {
		// 	await this.rendition.display(this.subpath);
		// 	return;
		// }
		//
		// //
		// const metadata = this.plugin.getFrontmatter(this.file);
		//
		// if (!metadata) {
		// 	await this.rendition.display();
		// }
		//
		// if (metadata?.cfi) {
		// 	await this.rendition.display(metadata.cfi);
		// }

	}

	setTheme() {
		this.rendition.themes.default({
			html: {
				"padding": "100px 0 0 0 !important"
			},
			body: {
				"font-family": "var(--font-text)",
				"color": `${getComputedStyle(document.body).getPropertyValue('--h1-color')};`,
				"line-height": "1.6",
			},
			h1: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--h1-color')};`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--h1-size')};`,
				"font-weight": `${getComputedStyle(document.body).getPropertyValue('--h1-weight')};`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--h1-family')};`,
			},
			h2: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--h2-color')}`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--h2-size')}`,
				"font-weight": `${getComputedStyle(document.body).getPropertyValue('--h2-weight')}`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--h2-family')}`,
			},
			h3: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--h3-color')}`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--h3-size')}`,
				"font-weight": `${getComputedStyle(document.body).getPropertyValue('--h3-weight')}`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--h3-family')}`,
			},
			h4: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--h4-color')}`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--h4-size')}`,
				"font-weight": `${getComputedStyle(document.body).getPropertyValue('--h4-weight')}`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--h4-family')}`,
			},
			h5: {
				"color": `${getComputedStyle(document.body).getPropertyValue('--h5-color')}`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--h5-size')}`,
				"font-weight": `${getComputedStyle(document.body).getPropertyValue('--h5-weight')}`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--h5-family')}`,
			},
			p: {
				// "color":'red',
				"color": `${getComputedStyle(document.body).getPropertyValue('--text-normal')};`,
				"font-family": `${getComputedStyle(document.body).getPropertyValue('--font-text')};`,
				"font-size": `${getComputedStyle(document.body).getPropertyValue('--font-text-size')};`,
				"line-height": `${getComputedStyle(document.body).getPropertyValue('--line-height-normal')};`,
			}
		});
	}


	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

}
