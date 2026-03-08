import {App, SuggestModal} from "obsidian";


export interface Chapter {
	id: string;
	label: string;
	href: string;
	parent: string | undefined;
	type: "parent" | "sub";
	color: string | null;
}

export class ChaptersList extends SuggestModal<Chapter> {
	private readonly chapters: Chapter[];
	private readonly display: (cfi: string) => void
	limit = 5000;

	constructor(app: App, chapters: Chapter[], display: (cfi: string) => void) {
		super(app);
		this.chapters = chapters;
		this.display = display;
	}

	getSuggestions(query: string): Chapter[] {

		return this.chapters.filter(chapter =>
			chapter.label.toLowerCase().includes(query.toLowerCase())
		);
	}

	onChooseSuggestion(item: Chapter, evt: MouseEvent | KeyboardEvent): void {
		this.display(item.href);
	}

	renderSuggestion(value: Chapter, el: HTMLElement): void {
		if(value.color){
			el.style.backgroundColor = `color-mix(in srgb, ${value.color}, transparent 70%)`;

		}
		// parent chapter
		if (value.type === "parent") {
			el.createEl('div', {text: value.label.trim()});
			if (value.parent) {
				const sub = el.createEl('small', {text: value.parent.trim()});
			}
		// sub chapters
		} else if (value.type === "sub") {
			const head = el.createEl('div', {text: value.label.trim()});
			head.style.marginLeft = "10px";
			// if (value.parent) {
			// 	const sub = el.createEl('small', {text: value.parent.trim()});
			// 	sub.style.marginLeft = "10px";
			// }
		}

	}


}
