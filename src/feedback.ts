/// <reference types="@rbxts/types/plugin" />
const TextService = game.GetService("TextService");

const TEXT_SIZE = 18;
const TEXT_FONT = Enum.Font.SourceSans;

/** A lightweight feedback system */
export = class Feedback {
	static currentFeedback?: Feedback;

	constructor(text: string) {
		print(`[rbxts-object-to-tree]`, text);		
	}
};
