import {Notice, Plugin, stringifyYaml, TFile, WorkspaceLeaf} from 'obsidian';
import {EpubView, VIEW_TYPE_EPUB} from "./EpubView";
import BookReaderSettingsTab from "./BookReaderSettingsTab";


interface BookReaderSettings {
	bookNotesFolder: string;
	nameTemplate: string;
}

const DEFAULT_SETTINGS: BookReaderSettings = {
	bookNotesFolder: '/',
	nameTemplate: '{{filename}}-book-note.md'
}

export default class BookReader extends Plugin {
	settings: BookReaderSettings;


	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BookReaderSettingsTab(this.app, this))
		this.registerExtensions(["epub"], VIEW_TYPE_EPUB)
		this.registerView(VIEW_TYPE_EPUB, (leaf: WorkspaceLeaf) => {
			return new EpubView(leaf, this);
		})
	}

	getBookFilePath(file: TFile) {
		const bookNoteName = this.settings.nameTemplate.replace('{{filename}}', file.name)
		return `${this.settings.bookNotesFolder}/${bookNoteName}`

	}


	async getCurrentBookRef(file: TFile) {
		const bookLinkPath = this.getBookFilePath(file)
		const linkFile = this.app.vault.getFileByPath(bookLinkPath)

		if (!linkFile) return null

		const raw = await this.app.vault.read(linkFile)
		const fm = this.app.metadataCache.getFileCache(linkFile)?.frontmatter

		return fm?.cfi ?? null
	}


	async updateFileData(file: TFile, cfi: string, progress: number) {
		const bookLinkFilePath = this.getBookFilePath(file)

		const isExist = await this.app.vault.adapter.exists(bookLinkFilePath)
		if (!isExist) {
			console.log(`Book not found!`)
			await this.app.vault.create(bookLinkFilePath, "")
		}


		const bookLinkFile = this.app.vault.getFileByPath(bookLinkFilePath)
		console.log("bookLinkFile",bookLinkFile)
		if (bookLinkFile) {
			console.log("path",bookLinkFile.path)
			console.log("base",bookLinkFile.basename)
			await this.app.fileManager.processFrontMatter(bookLinkFile, frontmatter => {
				frontmatter['cfi'] = cfi
				frontmatter['progress'] = progress
			})
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {

	}

}


