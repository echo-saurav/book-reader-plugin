import {App, Modal, Setting} from 'obsidian';

export class BookmarkNote extends Modal {
	constructor(app: App,
				onSubmit: (result: string) => void,
				onDelete: () => void
	) {
		super(app);
		this.setTitle('Edit Bookmark');

		let content = '';
		new Setting(this.contentEl)
			.setClass('setting-text-area')
			.addTextArea((text) =>
				text.setPlaceholder('Add Bookmark note')
					.onChange((value) => {
					content = value;
				})
			);

		new Setting(this.contentEl)
			.addButton((btn) => {
				btn.setButtonText('Delete bookmark')
					.setWarning()
					.onClick(() => {
						onDelete();
					})
			})
			.addButton((btn) =>
				btn
					.setButtonText('Save note')
					.setCta()
					.onClick(() => {
						this.close();
						onSubmit(content);
					}))

	}
}
