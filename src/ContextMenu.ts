import {Menu} from "obsidian";

export const getContextMenu = (
	selectedText: string | null,
	onHighlight: () => void,
	onBookmark: () => void,
	onTakeNote: () => void
) => {

	const menu = new Menu();

	console.log("selectedText", selectedText);
	if (selectedText) {
		menu.addItem(item => {
			item.setTitle(selectedText.slice(0, 40).trim())
				.setDisabled(true)
				.setIcon("cursor")
		});
		menu.addItem(item => {
			item.setTitle('Highlight')
				.setIcon("pen")
				.onClick(() => {
					onHighlight();
				})
		});

	}


	menu.addItem(item => {
		item
			.setTitle("Bookmark")
			.setIcon("bookmark")
			.onClick(() => {
				onBookmark();
			});

	});

	menu.addItem(item => {
		item
			.setTitle("Take note")
			.setIcon("file-plus-corner")
			.onClick(() => {
				onTakeNote();
			});

	});


	return menu;

}
