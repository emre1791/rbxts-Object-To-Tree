/// <reference types="@rbxts/testez/globals" />

import { generateInterface } from "./generateTree";

export = () => {
	it("tests", () => {
    const model = game.GetService('Workspace').WaitForChild('spider');
    const res = generateInterface(model);

    print(res);
	});
};
