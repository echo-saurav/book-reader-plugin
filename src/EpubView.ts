import {WorkspaceLeaf, FileView, TFile, Menu, moment} from "obsidian";

export const VIEW_TYPE_EPUB = "EPUB_VIEW"

export class EpubView extends FileView {
	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}


}
