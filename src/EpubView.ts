import {WorkspaceLeaf, FileView, TFile, debounce, IconName, setIcon, Debouncer} from "obsidian";
import ePub, {NavItem, Rendition} from 'epubjs';
import BookReader from "./main";
import {ChapterModal} from "./ChapterModal"; // Ensure you import the default export
export const VIEW_TYPE_EPUB = "epub"

export class EpubView extends FileView {
	allowNoFile: false;
	private rendition: Rendition
	private plugin: BookReader;
	private debounceRun: Debouncer<[file: TFile, cfi: any, progress: number], Promise<void>>;
	private nextButton: HTMLElement;
	private prevButton: HTMLElement;
	chapters: NavItem[] = [];


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin;
		const timeout = this.plugin.settings.updateDelay * 1000; // convert to minute

		this.debounceRun = debounce(async (file: TFile, cfi: any, progress: number) => {
			await this.plugin.updateFileData(file, cfi, progress);
		}, timeout, true)
	}

	createView(): HTMLElement {
		const container = this.contentEl;
		container.empty();

		// Create a wrapper div
		const epubDiv = container.createEl('div', {cls: 'epub-view'});
		// const nextButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__next-button', 'epub-button']}
		// );
		// const prevButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__previous-button', 'epub-button']}
		// );
		const lastButton = epubDiv.createEl('div',
			{cls: ['epub-view__last-button', 'epub-button']}
		);
		const menuButton = epubDiv.createEl('div',
			{cls: ['epub-view__menu-button', 'epub-button']}
		);

		const bottomBar = epubDiv.createEl('div',
			{cls: 'epub-view-bottom-bar'}
		);
		bottomBar.createEl('p', {text: "Page no 10"});

		// set all the icon
		// setIcon(prevButton, 'chevron-left');
		// setIcon(nextButton, 'chevron-right');
		setIcon(lastButton, 'undo-2');
		setIcon(menuButton, 'menu');
		//
		// epubDiv.addEventListener('mousemove', (event) => {
		// 	const clientX = event.clientX;
		// 	const clientY = event.clientY;
		//
		// 	// You can also get coordinates relative to the element itself
		// 	// const rect = myDiv.getBoundingClientRect();
		// 	// const xInsideDiv = clientX - rect.left;
		// 	// const yInsideDiv = clientY - rect.top;
		// 	//
		// 	// mouseCoordsDisplay.textContent = `X: ${clientX}, Y: ${clientY}`;
		// 	// menuButton.style.animation = 'none'; // reset
		// 	// // void menu.offsetWidth;         // trigger reflow
		// 	// menuButton.style.animation = 'appear-animation 2s forwards';
		// 	console.log(`X: ${clientX}, Y: ${clientY}`);
		// });

		// this.nextButton = nextButton;
		// this.prevButton = prevButton;

		menuButton.addEventListener('click', () => {
			new ChapterModal(this.app, this.chapters, null, async (chapterRef: NavItem) => {
				await this.rendition.display(chapterRef.href)
			}).open();
		});

		return epubDiv
	}


	async onLoadFile(file: TFile): Promise<void> {
		this.file = file;
		// const container = this.contentEl;
		// container.empty();
		//
		// // Create a wrapper div
		// const epubDiv = container.createEl('div', {cls: 'epub-view'});
		// const nextButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__next-button', 'epub-button']}
		// );
		// const prevButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__previous-button', 'epub-button']}
		// );
		// const lastButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__last-button', 'epub-button']}
		// );
		// const menuButton = epubDiv.createEl('div',
		// 	{cls: ['epub-view__menu-button', 'epub-button']}
		// );
		//
		// setIcon(prevButton, 'chevron-left');
		// setIcon(nextButton, 'chevron-right');
		// setIcon(lastButton, 'undo-2');
		// setIcon(menuButton, 'menu');
		// // const btn = epubDiv.createEl('div', {cls: 'epub-view_button'});

		const epubDiv = this.createView()

		// Read file as binary
		const contents = await this.app.vault.readBinary(file);

		// Load the book with URL
		const book = ePub(contents);

		// observe the height changes
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.contentRect.height;
				console.log("New height:", height);
				// do whatever update logic you want here
			}
		});

		ro.observe(epubDiv);

		this.rendition = book.renderTo(epubDiv, {
			width: "100%",
			height: "796.78125",
			allowScriptedContent: true,
			flow: "scrolled" // Options: "paginated" or "scrolled-doc"
			// flow: "paginated",
			// manager: "continuous"

		});

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

		const pageRef = await this.plugin.getCurrentBookRef(this.file)

		if (pageRef) {
			console.log(`page: ${pageRef}`);
			await this.rendition.display(pageRef);
		} else {
			console.log(`showing from start ${pageRef}`);
			await this.rendition.display();
		}

		this.rendition.on("relocated", async (range: any) => {
			const cfi = range.start.cfi;
			console.log("relocated", cfi);

			if (this.file) {
				this.debounceRun(this.file, cfi, 0)
			}

		})

		if (this.nextButton && this.prevButton) {
			this.nextButton.addEventListener('click', async () => {
				await this.rendition.next();

			})

			this.prevButton.addEventListener('click', async () => {
				await this.rendition.prev();
			})
		}


		//
		await book.ready; // make sure book is loaded
		const toc = book.navigation.toc; // array of chapters


		this.chapters = [];
		toc.forEach((chapter, i) => {
			console.log(chapter);
			this.chapters.push(chapter)
			// console.log(i, chapter.label, chapter.href, chapter.id);
		});

		// btn.addEventListener('click', async () => {
		// 	await rendition.display(10)
		// 	epubDiv.scrollTo(0, 100)
		// 	// await rendition.display("epubcfi(/6/22!/4/2[calibre_pb_13]/2[bookmark38]/2/1:0)")
		// 	await rendition.display("epubcfi(/6/18!/4/202/2/1:698)")
		// })

		// rendition.on("selected", function (range: any) {
		// 	console.log("selected", range);
		// 	rendition.annotations.add("highlight", range, {
		// 		fill: "red",
		//
		// 	});
		// });
		//
		// rendition.on('scroll', async (range: any) => {
		// 	// console.log("scroll", range);
		// })


		return super.onLoadFile(file);
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
		return "folder";
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

	onload() {
		super.onload();
		console.log("load");
	}

	onunload() {
		super.onunload();
		console.log("unload");
	}

}
