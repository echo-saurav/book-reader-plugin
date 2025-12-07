import {App, SuggestModal} from 'obsidian';
import {NavItem} from "epubjs";


export class ChapterModal extends SuggestModal<NavItem> {
	private onSelectChapter: (chapter: NavItem) => void
	private chapters: NavItem[]
	private parentLabel: string | null

	constructor(public app: App, chapters: NavItem[], parentLabel: string | null, onSelectChapter: (chapter: NavItem) => void) {
		super(app);
		this.onSelectChapter = onSelectChapter
		this.chapters = chapters;
		this.parentLabel = parentLabel;
	}

	getSuggestions(query: string): NavItem[] {
		return this.chapters.filter((chapter) => {
				return chapter.label.trim().toLowerCase().includes(query.toLowerCase())
			}
		);
	}

	renderSuggestion(chapter: NavItem, el: HTMLElement) {
		el.createEl('div', {text: chapter.label.trim()});
		if (this.parentLabel) {
			el.createEl('small', {text: this.parentLabel});
		}
	}

	onChooseSuggestion(chapter: NavItem, evt: MouseEvent | KeyboardEvent) {
		if (chapter.subitems?.length == 0) {
			this.onSelectChapter(chapter);
		} else if (chapter.subitems instanceof Array<NavItem>) {
			new ChapterModal(this.app, chapter.subitems, chapter.label, this.onChooseSuggestion.bind(this)).open();
		}

	}
}
