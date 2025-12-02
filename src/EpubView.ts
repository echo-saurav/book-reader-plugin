import {WorkspaceLeaf, FileView, TFile, Menu, moment, IconName} from "obsidian";
import ePub from 'epubjs';
import BookReader from "./main"; // Ensure you import the default export
export const VIEW_TYPE_EPUB = "epub"

export class EpubView extends FileView {
	allowNoFile: false;
	private plugin: BookReader;


	constructor(leaf: WorkspaceLeaf, plugin: BookReader) {
		super(leaf);
		this.plugin = plugin
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.file = file;
		const container = this.contentEl;
		container.empty();

		// Create a wrapper div
		const epubDiv = container.createEl('div', {cls: 'epub-view'});
		const nextButton = epubDiv.createEl('div', {cls: 'epub-view__next-button'});
		const prevButton = epubDiv.createEl('div', {cls: 'epub-view__previous-button'});
		// const btn = epubDiv.createEl('div', {cls: 'epub-view_button'});

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

		const rendition = book.renderTo(epubDiv, {
			width: "100%",
			height: "796.78125",
			allowScriptedContent: true,
			flow: "scrolled" // Options: "paginated" or "scrolled-doc"
			// flow: "paginated",
			// manager: "continuous"

		});

		rendition.themes.default({
			body: {
				"font-family": "var(--font-text)",
				"color": "var(--h1-color)",
				"line-height": "1.6"
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
			await rendition.display(pageRef);
		} else {
			console.log(`showing from start ${pageRef}`);
			await rendition.display();
		}

		rendition.on("relocated", async (range: any) => {
			console.log("page", range.start.cfi);
			if (this.file) {
				const cfi = range.start.cfi;
				const progress = range.start.percentage; // 0 → 1 inside chapter
				console.log("progress",progress)
				await this.plugin.updateFileData(this.file, cfi, progress)
			}

		})

		nextButton.addEventListener('click', async () => {
			await rendition.next();

		})
		prevButton.addEventListener('click', async () => {
			await rendition.prev();
		})

		//
		// await book.ready; // make sure book is loaded
		// const toc = book.navigation.toc; // array of chapters
		//
		//
		// toc.forEach((chapter, i) => {
		// 	// console.log(i, chapter.label, chapter.href, chapter.id);
		// });

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
