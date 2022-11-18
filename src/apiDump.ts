import { ApiClass, ApiDump } from "api";
import Feedback from "feedback";

const HttpService = game.GetService("HttpService");

let apiDump: ReadonlyMap<string, ApiClass> | undefined;

export = function () {
	if (apiDump) {
		return apiDump;
	} else {
		new Feedback("Fetching API data...");
		// alternative "https://anaminus.github.io/rbx/json/api/latest.json"
		const [success, response] = pcall(() =>
			HttpService.GetAsync(
				"https://raw.githubusercontent.com/CloneTrooper1019/Roblox-Client-Watch/roblox/API-Dump.json",
			),
		);

		if (success) {
			const [success2, response2] = pcall(() => HttpService.JSONDecode(response) as ApiDump);

			if (success2) {
				const dumpMap = new Map<string, ApiClass>();

				for (const rbxClass of response2.Classes) {
					const superclass = dumpMap.get(rbxClass.Superclass);
					if (superclass) {
						for (const rbxMember of superclass.Members) {
							rbxClass.Members.push(rbxMember);
						}
					}

					dumpMap.set(rbxClass.Name, rbxClass);
				}

				return (apiDump = dumpMap);
			} else {
				new Feedback("[FATAL] Failed to decode API data.");
			}
		} else {
			new Feedback("Failed to fetch API data. Please enable HttpService.HttpEnabled.");
		}
	}
};
