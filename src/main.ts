import {Notice, Plugin, TFile, WorkspaceLeaf} from 'obsidian';
import BookReaderSettingsTab from "./BookReaderSettingsTab";
import {EpubView, VIEW_TYPE_EPUB} from "./EpubView";


interface BookReaderSettings {
	// bookNotesFolder: string;
	nameTemplate: string;
	updateDelay: number;
	// metadata keys
	titleKey: string
	descriptionKey: string
	authorKey: string
	languageKey: string
	publisherKey: string
	//
	bookLinkKey: string;
	totalPagesKey: string;
	currentPageRefKey: string;
	progressKey: string
	epubLocationsDataKey: string
	//
	highlightsKey: string;
	bookmarksKey: string;
	notesKey: string;

}

const DEFAULT_SETTINGS: BookReaderSettings = {
	// bookNotesFolder: '/',
	nameTemplate: '{{filename}}-book-note.md',
	updateDelay: 1,
	//
	titleKey: 'title',
	descriptionKey: 'description',
	authorKey: 'author',
	languageKey: 'language',
	publisherKey: 'publisher',
	//
	bookLinkKey: 'bookLink',
	totalPagesKey: 'totalPages',
	currentPageRefKey: 'currentPageRef',
	progressKey: 'progress',
	epubLocationsDataKey: 'epubLocations',
	//
	highlightsKey: 'highlights',
	bookmarksKey: 'bookmarks',
	notesKey: 'notes',

}

export default class BookReader extends Plugin {
	settings: BookReaderSettings;


	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BookReaderSettingsTab(this.app, this));
		this.registerExtensions(["epub"], VIEW_TYPE_EPUB);
		this.registerView(VIEW_TYPE_EPUB, (leaf: WorkspaceLeaf) => {
			// return new EpubViewer(leaf, this);
			return new EpubView(leaf, this);
		});
	}

	async initializeMarkdownFile(
		bookFile: TFile,
		title: string,
		author: string,
		description: string,
		language: string,
		publisher: string,
		totalPages: number,
		epubLocations: string[]) {
		//
		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null

		// update
		await this.app.fileManager.processFrontMatter(markdownFile, frontmatter => {
			frontmatter[this.settings.bookLinkKey] = `[[${bookFile.path}]]`;
			frontmatter[this.settings.titleKey] = title;
			frontmatter[this.settings.authorKey] = author;
			frontmatter[this.settings.descriptionKey] = description;
			frontmatter[this.settings.languageKey] = language;
			frontmatter[this.settings.publisherKey] = publisher;
			frontmatter[this.settings.totalPagesKey] = totalPages;
			frontmatter[this.settings.epubLocationsDataKey] = epubLocations;
		});

	}

	async setEpubLocationMap(bookFile: TFile, epubLocations: string) {
		if (!bookFile) return
		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null

		await this.app.fileManager.processFrontMatter(markdownFile, frontmatter => {
			frontmatter[this.settings.epubLocationsDataKey] = epubLocations;
		});
	}

	async getEpubLocationMap(bookFile: TFile) {
		if (!bookFile) return
		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null
		const metadata = this.getFrontmatter(markdownFile);
		if (!metadata) return null
		return metadata[this.settings.epubLocationsDataKey];

	}


	// adding functions
	async addHighlight(bookFile: TFile | null, cfiRange: string | null, color: string | null, content: string | null) {
		if (!cfiRange && !bookFile) return;
		const newHighlight = `${cfiRange}|${color}|${content}`;
		// const newHighlight = `${cfiRange}|${color}`;
		console.log(newHighlight);
		this.pushDataToFrontmatter(bookFile, this.settings.highlightsKey, newHighlight);
		// append to file
		const highlightLink = `[[${bookFile?.path}#${cfiRange}|${content}]]`
		this.appendToFile(bookFile, highlightLink);
	}

	async addBookmark(bookFile: TFile | null, cfi: string, pageNo: number, content: string | null) {
		if (!cfi) {
			new Notice("Bookmark added failed.");
		}
		const newBookmark = `${cfi}|${pageNo}|${content}`
		this.pushDataToFrontmatter(bookFile, this.settings.bookmarksKey, newBookmark);
		new Notice(`Bookmark added successfully (${content?.substring(0, 20)}) `);
	}

	async addNote(bookFile: TFile, cfi: string, color: string | null, note: string, content: string) {
		const newBookNote = `${cfi}|${color}|${content}`;
		this.pushDataToFrontmatter(bookFile, this.settings.notesKey, newBookNote);
	}

	// getting data
	async getAllHighlights(bookFile: TFile) {
		const markdownFile = await this.getMarkdownFile(bookFile);
		const fm = this.getFrontmatter(markdownFile);

		if (fm && fm[this.settings.highlightsKey]) {
			return fm[this.settings.highlightsKey];
		}
		return [];
	}

	async getAllBookmarks(bookFile: TFile) {
		const markdownFile = await this.getMarkdownFile(bookFile);
		const fm = this.getFrontmatter(markdownFile);

		if (fm && fm[this.settings.bookmarksKey]) {
			return fm[this.settings.bookmarksKey];
		}
		return [];
	}

	async getAllNotes(bookFile: TFile) {
		const markdownFile = await this.getMarkdownFile(bookFile);
		const fm = this.getFrontmatter(markdownFile);

		if (fm && fm[this.settings.notesKey]) {
			return fm[this.settings.notesKey];
		}
		return [];
	}

	// delete data
	async deleteHighlight(bookFile: TFile | null, highlight: string) {
		if (!bookFile) return
		this.removeDataFromFrontmatter(bookFile, this.settings.highlightsKey, highlight);
	}

	async deleteBookmark(bookFile: TFile | null, bookmark: string) {
		if (!bookFile) return
		this.removeDataFromFrontmatter(bookFile, this.settings.bookmarksKey, bookmark);
	}

	async deleteNote(bookFile: TFile | null, note: string) {
		if (!bookFile) return
		this.removeDataFromFrontmatter(bookFile, this.settings.notesKey, note);
	}


	// other updates
	async updatePageProgress(bookFile: TFile, cfi: string) {
		// console.log('updatePage', cfi)
		const markdownFile = await this.getMarkdownFile(bookFile);
		// console.log('before found markdown', markdownFile);
		if (!markdownFile) return null
		// console.log('found markdown', markdownFile);

		await this.app.fileManager.processFrontMatter(markdownFile, frontmatter => {
			frontmatter[this.settings.currentPageRefKey] = cfi
			console.log('updatePage', cfi)
			// console.log('frontmatter', frontmatter);
			// console.log("markdownFile",markdownFile);
		});
	}


	// helper functions
	getMarkdownFilePath(file: TFile) {
		const bookNotePath = this.settings.nameTemplate.replace('{{filename}}', file.name);
		// const bookFilePath =`${this.settings.bookNotesFolder}/${bookNoteName}`
		// const bookFilePath =`${this.settings.bookNotesFolder}/${bookNoteName}`
		// console.log('book file path', bookNotePath);
		return bookNotePath;
	}

	async getMarkdownFile(bookFile: TFile) {
		const markdownFilePath = this.getMarkdownFilePath(bookFile);
		const isExist = await this.app.vault.adapter.exists(markdownFilePath);
		// create the file with metadata
		if (!isExist) {
			await this.app.vault.create(markdownFilePath, "");
		}
		//
		return this.app.vault.getFileByPath(markdownFilePath);
	}

	getFrontmatter(markdownFile: TFile | null) {
		if (!markdownFile) return null;
		return this.app.metadataCache.getFileCache(markdownFile)?.frontmatter
	}

	async pushDataToFrontmatter(bookFile: TFile | null, key: string, newData: any) {
		if (!bookFile) return

		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null

		await this.app.fileManager.processFrontMatter(markdownFile, frontmatter => {

			const keyValues: string[] = frontmatter[key] ? frontmatter[key] : [];
			keyValues.push(newData);
			frontmatter[key] = keyValues;

		});
	}

	async appendToFile(bookFile: TFile | null, content: string) {
		if (!bookFile) return

		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null

		await this.app.vault.append(markdownFile, content);

	}

	async removeDataFromFrontmatter(bookFile: TFile | null, key: string, deletingData: any) {
		if (!bookFile) return

		const markdownFile = await this.getMarkdownFile(bookFile);
		if (!markdownFile) return null

		await this.app.fileManager.processFrontMatter(markdownFile, frontmatter => {
			const keyValues: string[] = frontmatter[key] ? frontmatter[key] : [];
			keyValues.remove(deletingData);
			frontmatter[key] = keyValues;
		});
	}

	public async runTemplaterReplace() {
		const templaterReplaceCommandId = "templater-obsidian:replace-in-file-templater";
		const saveCommandId = "editor:save-file";
		const toggleLeft = "app:toggle-left-sidebar";


		(this.app as any).commands.executeCommandById(toggleLeft);


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


