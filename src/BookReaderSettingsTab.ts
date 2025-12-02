import {App, PluginSettingTab, Setting} from "obsidian";
import BookReader from "./main";

export default class BookReaderSettingsTab extends PluginSettingTab {
	plugin: BookReader;

	constructor(app: App, plugin: BookReader) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Book notes folder')
			.addText(text => text
				.setPlaceholder('folder')
				.setValue(this.plugin.settings.bookNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.bookNotesFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Notes name template')
			.setDesc("use {{filename}} as a placeholder for file name. Example: '{{filename}}-book-note.md'")
			.addText(text => text
				.setPlaceholder('{{filename}}.md')
				.setValue(this.plugin.settings.nameTemplate)
				.onChange(async (value) => {
					this.plugin.settings.nameTemplate = value;
					await this.plugin.saveSettings();
				}));
	}
}
