import {Menu} from "obsidian";

export const getContextMenu = (
	selectedText: string,
	onHighlight: () => void,
	onBookmark: () => void,
	onTakeNote: () => void,
	onDelete: () => void
) => {

	const menu = new Menu();

	if (selectedText) {
		menu.addItem(item => {
			item.setTitle(selectedText.slice(0,40).trim())
				.setDisabled(true)
				.setIcon("highlight")
		});
	}


	menu.addItem(item => {
		item
			.setTitle("Highlight")
			.setIcon("highlight")
			.onClick(() => {
				onHighlight();
			});

	});
	menu.addItem(item => {
		item
			.setTitle("Bookmark")
			.setIcon("highlight")
			.onClick(() => {
				onBookmark();
			});

	});

	menu.addItem(item => {
		item
			.setTitle("Take note")
			.setIcon("pen")
			.onClick(() => {
				onTakeNote();
			});

	});

	menu.addItem(item => {
		item
			.setTitle("Delete")
			.setIcon("trash")
			.onClick(() => {
				onDelete();
			});

	});
	menu.addItem(item => {
		item
			.setTitle("Cancel")
			.setIcon("close")
			.onClick(() => {
				menu.close();
			});

	});


	return menu;

}
