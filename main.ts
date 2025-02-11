import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

interface PageContent {
	title: string;
	content: string[];
	pageNumber: number;
	totalPages: number;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// 添加小红书分享命令
		this.addCommand({
			id: 'share-to-rednote',
			name: 'Share to RedNote',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// 获取当前编辑器中的内容
				const content = editor.getValue();
				const fileName = view.file?.basename;

				// 创建小红书格式的分享内容
				this.createRedNoteShare(content, fileName);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SocialShareSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async generateRedNoteImages(content: string, fileName: string): Promise<string[]> {
		// 移除 schema header（通常在 --- 之间的内容）
		content = content.replace(/^---[\s\S]*?---\n/, '');

		// 分页处理
		const pages = this.splitContentIntoPages(content);
		const images: string[] = [];

		for (const page of pages) {
			const imageData = await this.generateSinglePageImage(page, fileName);
			if (imageData) {
				images.push(imageData);
			}
		}

		return images;
	}

	private splitContentIntoPages(content: string): PageContent[] {
		const paragraphs = content.split('\n').filter(line => line.trim());
		const pages: PageContent[] = [];
		let currentPage: string[] = [];
		let pageCount = 0;

		// 每页大约显示12行内容
		for (let i = 0; i < paragraphs.length; i++) {
			currentPage.push(paragraphs[i]);

			if (currentPage.length >= 12 || i === paragraphs.length - 1) {
				pageCount++;
				pages.push({
					title: pageCount === 1 ? paragraphs[0] : '继续阅读',
					content: currentPage,
					pageNumber: pageCount,
					totalPages: Math.ceil(paragraphs.length / 12)
				});
				currentPage = [];
			}
		}

		return pages;
	}

	private async generateSinglePageImage(page: PageContent, fileName: string) {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// 小红书推荐尺寸
		const width = 1080;
		const height = 1440;
		canvas.width = width;
		canvas.height = height;

		// 绘制背景
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);

		const margin = 60;
		let y = margin + 50;

		// 添加标题
		ctx.fillStyle = '#333333';
		ctx.font = 'bold 48px "PingFang SC"';
		ctx.fillText(page.title, margin, y);
		y += 100;

		// 处理正文内容
		ctx.font = '36px "PingFang SC"';
		const lineHeight = 50;
		const maxWidth = width - margin * 2;

		for (const paragraph of page.content) {
			if (paragraph === page.title && page.pageNumber === 1) continue;

			const lines = this.wrapText(ctx, paragraph, maxWidth);
			for (const line of lines) {
				if (y > height - 100) break;
				ctx.fillText(line, margin, y);
				y += lineHeight;
			}
			y += 20; // 段落间距
		}

		// 添加页码
		ctx.fillStyle = '#666666';
		ctx.font = '28px "PingFang SC"';
		ctx.fillText(`${page.pageNumber}/${page.totalPages}`, width - 100, height - 50);

		return canvas.toDataURL('image/png');
	}

	// 文字换行处理
	private wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
		const words = text.split(' ');
		const lines = [];
		let currentLine = '';

		for (const word of words) {
			const testLine = currentLine + word + ' ';
			const metrics = context.measureText(testLine);
			if (metrics.width > maxWidth && currentLine !== '') {
				lines.push(currentLine);
				currentLine = word + ' ';
			} else {
				currentLine = testLine;
			}
		}
		lines.push(currentLine);
		return lines;
	}

	private async createRedNoteShare(content: string, fileName: string | undefined) {
		if (!fileName) {
			new Notice('请先保存文件');
			return;
		}

		// 生成多张图片
		const images = await this.generateRedNoteImages(content, fileName);
		if (!images.length) return;

		// 显示预览模态框
		new ImagePreviewModal(this.app, images, fileName).open();
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SocialShareSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

// 修改预览模态框以支持多张图片
class ImagePreviewModal extends Modal {
	private currentIndex = 0;

	constructor(
		app: App,
		private images: string[],
		private fileName: string
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '小红书内容预览' });

		// 创建图片容器
		const imageContainer = contentEl.createDiv({ cls: 'image-preview-container' });

		// 添加样式
		imageContainer.style.position = 'relative';
		imageContainer.style.maxWidth = '100%';
		imageContainer.style.margin = '20px 0';

		this.displayCurrentImage(imageContainer);

		// 添加导航按钮
		const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'space-between';
		buttonContainer.style.marginTop = '20px';

		if (this.images.length > 1) {
			new Setting(buttonContainer)
				.addButton(btn => btn
					.setButtonText('上一页')
					.setDisabled(this.currentIndex === 0)
					.onClick(() => {
						this.currentIndex--;
						this.displayCurrentImage(imageContainer);
						this.updateButtons(buttonContainer);
					}))
				.addButton(btn => btn
					.setButtonText('下一页')
					.setDisabled(this.currentIndex === this.images.length - 1)
					.onClick(() => {
						this.currentIndex++;
						this.displayCurrentImage(imageContainer);
						this.updateButtons(buttonContainer);
					}))
				.addButton(btn => btn
					.setButtonText('保存全部图片')
					.onClick(() => this.saveAllImages()));
		} else {
			new Setting(buttonContainer)
				.addButton(btn => btn
					.setButtonText('保存图片')
					.onClick(() => this.saveImage(this.images[0], 1)));
		}
	}

	private displayCurrentImage(container: HTMLElement) {
		container.empty();
		const img = container.createEl('img', {
			attr: {
				src: this.images[this.currentIndex],
				style: 'max-width: 100%; border-radius: 8px;'
			}
		});
	}

	private updateButtons(container: HTMLElement) {
		const prevButton = container.querySelector('button:first-child') as HTMLButtonElement;
		const nextButton = container.querySelector('button:nth-child(2)') as HTMLButtonElement;

		if (prevButton) prevButton.disabled = this.currentIndex === 0;
		if (nextButton) nextButton.disabled = this.currentIndex === this.images.length - 1;
	}

	private saveImage(imageData: string, index: number) {
		const link = document.createElement('a');
		link.download = `${this.fileName}_小红书分享_${index}.png`;
		link.href = imageData;
		link.click();
	}

	private saveAllImages() {
		this.images.forEach((imageData, index) => {
			this.saveImage(imageData, index + 1);
		});
		new Notice('所有图片已保存');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
