import { generateInterface } from "generateTree";

const replicatedStorage = game.GetService("ReplicatedStorage");
const httpService = game.GetService("HttpService");

const assetsFolder = replicatedStorage.WaitForChild("assets", 120);

assert(assetsFolder?.IsA("Folder"), "assets folder not found");

function throttle(fn: () => void, wait: number) {
  let time = tick();
  return () => {
    if (tick() - time >= wait) {
      fn();
      time = tick();
    }
  };
}

function onInstanceChange(instance: Instance) {
  const res = generateInterface(instance);
  const assetName = instance.Name;

  const [success, response] = pcall(() => {
    const url = `http://localhost:7006/update-asset-types`;
    const headers = new Map<string, string>();
    headers.set("Content-Type", "application/json");

    const data = {
      assetName,
      assetTypes: res,
    };

    return httpService.PostAsync(
      url,
      httpService.JSONEncode(data),
      Enum.HttpContentType.ApplicationJson,
      false,
      headers
    );
  });

  if (!success) {
    warn(`failed to update asset types for ${assetName}\n${response}`);
  }
}

function onChild(child: Instance) {
  spawn(() => {
    const childChanged = throttle(() => onInstanceChange(child), 0.5);   
    
    child.GetDescendants().forEach((desc) => {
      (desc.Changed as RBXScriptSignal).Connect(childChanged);
    });

    (child.ChildAdded as RBXScriptSignal).Connect(childChanged);

    childChanged();
  });
}

assetsFolder.ChildAdded.Connect(onChild);
assetsFolder.GetChildren().forEach(onChild);

export const _moduleExport = true;
