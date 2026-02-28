import {Plugin, TFile, WorkspaceLeaf} from 'obsidian';
import BookReaderSettingsTab from "./BookReaderSettingsTab";
import {EpubViewer, HOVER_ID, VIEW_TYPE_EPUB} from "./EpubViewer";


interface BookReaderSettings {
	bookNotesFolder: string;
	nameTemplate: string;
	updateDelay: number;
}

const DEFAULT_SETTINGS: BookReaderSettings = {
	bookNotesFolder: '/',
	nameTemplate: '{{filename}}-book-note.md',
	updateDelay: 1,
}

export default class BookReader extends Plugin {
	settings: BookReaderSettings;


	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BookReaderSettingsTab(this.app, this));
		this.registerExtensions(["epub"], VIEW_TYPE_EPUB);
		this.registerView(VIEW_TYPE_EPUB, (leaf: WorkspaceLeaf) => {
			return new EpubViewer(leaf, this);
		});
		this.registerHoverLinkSource(HOVER_ID, {
			display: 'Hooo',
			defaultMod: true,
		})
	}

	getBookFilePath(file: TFile) {
		const bookNoteName = this.settings.nameTemplate.replace('{{filename}}', file.name);
		return `${this.settings.bookNotesFolder}/${bookNoteName}`;
	}

	getFrontmatter(file: TFile) {
		const bookLinkPath = this.getBookFilePath(file);
		const linkFile = this.app.vault.getFileByPath(bookLinkPath);

		if (!linkFile) return null

		return this.app.metadataCache.getFileCache(linkFile)?.frontmatter
	}


	getBookPageRef(file: TFile) {
		const fm = this.getFrontmatter(file)
		return fm?.cfi ?? null
	}


	async updatePage(file: TFile, cfi: string) {
		console.log('updatePage', cfi)
		const bookLinkFilePath = this.getBookFilePath(file);
		const isExist = await this.app.vault.adapter.exists(bookLinkFilePath);
		if (!isExist) {
			await this.app.vault.create(bookLinkFilePath, "");
		}

		const bookLinkFile = this.app.vault.getFileByPath(bookLinkFilePath);
		if (!bookLinkFile) return null

		await this.app.fileManager.processFrontMatter(bookLinkFile, frontmatter => {
			frontmatter.pastCfi = frontmatter.cfi
			frontmatter.cfi = cfi
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


