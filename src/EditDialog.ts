import {App, Modal, Setting} from 'obsidian';

export class EditDialog extends Modal {
	textArea: HTMLElement;
	confirmButton: HTMLElement;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.setTitle('What\'s your name?');

		let name = '';
		new Setting(this.contentEl)
			.setClass('setting-text-area')
			.addTextArea((text) =>
				text.onChange((value) => {
					name = value;
				}))


		new Setting(this.contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Submit')
					.setCta()
					.onClick(() => {
						this.close();
						onSubmit(name);
					}));
	}
}
