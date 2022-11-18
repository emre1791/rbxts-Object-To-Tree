import formatValue from "formatValue";
import getAPIDump from "./apiDump";
import { SecurityType, ApiClass } from "api";

const propNames = new Map<string, ReadonlyArray<string>>();

function getPropNames(className: string) {
	let classPropNames = propNames.get(className);

	if (classPropNames === undefined) {
		propNames.set(
			className,
			(classPropNames =
				getAPIDump()
					?.get(className)
					?.Members.map((m) => m.Name) ?? error("Unable to get indexable names for " + className)),
		);
	}

	return classPropNames;
}

/** Given an object, will return an array of Children, excluding children with duplicate names */
function getUniqueChildren(object: Instance) {
	const takenNames = new Set(getPropNames(object.ClassName));
	const shouldParse = new Map<string, Instance>();

	for (const instance of object.GetChildren()) {
		const { Name: name } = instance;

		if (takenNames.has(name)) {
			shouldParse.delete(name);
		} else {
			takenNames.add(name);
			shouldParse.set(name, instance);
		}
	}

	return shouldParse;
}

function getTSVariableName(name: string) {
	return (name.match("^[%a_][%w_]*$")[0] as string) ?? "X";
}

/** Handwritten replacement function for properly extending roblox services */
function createTopLevelInterface({ ClassName: className, Name: name }: Instance) {
	const varName = getTSVariableName(name);

	switch (className) {
		case "Workspace":
			return "interface Workspace extends Model";
		case "Terrain":
			return "interface Terrain extends BasePart";
		case "StarterGui":
			return "interface StarterGui extends BasePlayerGui";
		case "StarterCharacterScripts":
			return "interface StarterCharacterScripts extends StarterPlayerScripts";
		case "ReplicatedFirst":
			warn("Instances in ReplicatedFirst are not guaranteed to exist immediately! Beware!");
		case "Lighting":
		case "ReplicatedStorage":
		case "ServerScriptService":
		case "ServerStorage":
		case "StarterPack":
		case "StarterPlayer":
		case "StarterPlayerScripts":
		case "SoundService":
		case "Chat":
		case "TestService":
			return `interface ${className} extends Instance`;
		default:
			return `type ${varName.sub(1, 1).upper() + varName.sub(2)} = ${className} &`;
	}
}

const invalidTSBlacklist = new Set([
	"do",
	"if",
	"in",
	"for",
	"let",
	"new",
	"try",
	"var",
	"case",
	"else",
	"enum",
	"eval",
	"false",
	"null",
	"this",
	"true",
	"void",
	"with",
	"break",
	"catch",
	"class",
	"const",
	"super",
	"throw",
	"while",
	"yield",
	"delete",
	"export",
	"import",
	"public",
	"return",
	"static",
	"switch",
	"typeof",
	"default",
	"extends",
	"finally",
	"package",
	"private",
	"continue",
	"debugger",
	"function",
	"arguments",
	"interface",
	"protected",
	"implements",
	"instanceof",
]);

function validTSIdentifier(str: string) {
	return !invalidTSBlacklist.has(str) && str.find("^[%a_$][%w_$]*$")[0] !== undefined ? str : `["${str}"]`;
}

/** Recursively generates trees for given objects */
function generateSubInterface(results: Array<string>, [instanceName, instance]: [string, Instance], depth: number) {
	results.push(`${"\t".rep(depth - 1)}${validTSIdentifier(instanceName)}: ${instance.ClassName}`);
	const children = getUniqueChildren(instance);

	if (!children.isEmpty()) {
		results.push(` & {\n`);

		for (const child of children) {
			generateSubInterface(results, child, depth + 1);
		}

		results.push("\t".rep(depth - 1));
		results.push("}");
	}
	results.push(";\n");
}

/** Generates an interface for a given instance. */
export function generateInterface(instance: Instance) {
	const results: Array<string> = [createTopLevelInterface(instance), " {\n"];
	for (const child of getUniqueChildren(instance)) generateSubInterface(results, child, 2);
	results.push("}\n");
	results.push("\n");
	
	const varName = getTSVariableName(instance.Name);
	const typeName = varName.sub(1, 1).upper() + varName.sub(2);
	const exportName = varName.sub(1, 1).lower() + varName.sub(2);

	results.push(`declare const ${exportName}: ${typeName};\n`);
	results.push(`export = ${exportName};\n`);

	return results.join('');
}

const defaultObjects = {} as CreatableInstances;

function getDefaultPropertyOfInstanceType<
	T extends keyof CreatableInstances,
	P extends WritablePropertyNames<CreatableInstances[T]>
>(className: T, property: P): CreatableInstances[T][P] {
	let defaultObj = defaultObjects[className];
	if (!defaultObj) {
		const attempt = opcall(() => new Instance(className));
		if (attempt.success) {
			defaultObjects[className] = defaultObj = attempt.value;
		} else {
			error(attempt.error);
		}
	}
	return defaultObj[property];
}

const hasText = (obj: Instance): obj is TextBox | TextLabel | TextButton =>
	obj.IsA("TextBox") || obj.IsA("TextLabel") || obj.IsA("TextBox");

const exclusionConditions: Array<{ condition: (obj: Instance) => boolean; omitProperties: Array<string> }> = [
	{ condition: (obj) => obj.IsA("GuiObject"), omitProperties: ["Transparency"] },
	{
		condition: (obj) => obj.IsA("GuiObject") && obj.BackgroundTransparency === 1,
		omitProperties: ["BackgroundColor3", "BorderColor3", "BorderSizePixel"],
	},
	{ condition: (obj) => obj.IsA("GuiObject") && obj.BorderSizePixel === 0, omitProperties: ["BorderColor3"] },
	{ condition: (obj) => hasText(obj) && obj.TextStrokeTransparency === 1, omitProperties: ["TextStrokeColor3"] },
	{
		condition: (obj) => hasText(obj) && obj.TextTransparency === 1,
		omitProperties: [
			"TextStrokeTransparency",
			"TextStrokeColor3",
			"TextColor3",
			"TextScaled",
			"Font",
			"FontSize",
			"Text",
			"TextTransparency",
			"TextWrapped",
			"TextXAlignment",
			"TextYAlignment",
		],
	},
	{
		condition: (obj) => obj.IsA("BasePart"),
		omitProperties: ["Position", "Rotation", "Orientation", "BrickColor"],
	},
	{ condition: (obj) => obj.IsA("Attachment") || obj.IsA("BasePart"), omitProperties: ["Rotation", "CFrame"] },
	{ condition: (obj) => obj.IsA("MeshPart"), omitProperties: ["MeshId"] },
	{ condition: (obj) => obj.IsA("LuaSourceContainer"), omitProperties: ["Source"] },
];

const ignoredTags = new ReadonlySet(["Deprecated", "NotScriptable", "ReadOnly"]);
const validSecurityTags = new ReadonlySet<SecurityType>(["None", "PluginSecurity"]);

function isDisjointWith(a: Array<unknown>, b: ReadonlySet<unknown>) {
	for (const x of a) {
		if (b.has(x)) return false;
	}

	return true;
}

function getPropertiesToCompile(rbxClass: ApiClass, instance: Instance, omittedProperties = new Set<string>()) {
	for (const { condition, omitProperties } of exclusionConditions) {
		if (condition(instance)) for (const omitProperty of omitProperties) omittedProperties.add(omitProperty);
	}

	return rbxClass.Members.filter(
		(rbxMember) =>
			rbxMember.MemberType === "Property" &&
			!omittedProperties.has(rbxMember.Name) &&
			(!rbxMember.Tags || isDisjointWith(rbxMember.Tags, ignoredTags)) &&
			(typeIs(rbxMember.Security, "string")
				? validSecurityTags.has(rbxMember.Security)
				: validSecurityTags.has(rbxMember.Security.Read) && validSecurityTags.has(rbxMember.Security.Write)) &&
			instance[rbxMember.Name as keyof typeof instance] !==
				getDefaultPropertyOfInstanceType(
					instance.ClassName as keyof CreatableInstances,
					rbxMember.Name as WritablePropertyNames<CreatableInstances[keyof CreatableInstances]>,
				),
	).sort(({ Name: a }, { Name: b }) => a !== "Parent" && (b === "Parent" || a < b));
}

function instantiateHelper(apiDump: ReadonlyMap<string, ApiClass>, instance: Instance, results: Array<string>) {
	const rbxClass = apiDump.get(instance.ClassName);

	if (rbxClass) {
		const varName = getTSVariableName(instance.Name);
		results.push(`const ${varName} = new Instance("${instance.ClassName}");\n`);

		for (const { Name: prop } of getPropertiesToCompile(rbxClass, instance)) {
			results.push(varName);
			results.push(".");
			results.push(prop);
			results.push(" = ");
			results.push(formatValue(instance[prop as keyof typeof instance]));
			results.push(";\n");
		}

		results.push("\n");
		for (const child of instance.GetChildren()) instantiateHelper(apiDump, child, results);
	}

	return results;
}

function roactHelper(apiDump: ReadonlyMap<string, ApiClass>, instance: Instance, results: Array<string>, depth = 0) {
	const rbxClass = apiDump.get(instance.ClassName);

	if (rbxClass) {
		const children = instance
			.GetChildren()
			.filter((child) => child.IsA("GuiObject") || child.IsA("UIBase") || child.IsA("LayerCollector"));

		const indent = `\t`.rep(depth);
		results.push(indent);
		results.push(`<`);
		results.push(instance.ClassName.lower());

		const propResults = new Array<string>();
		let propLength = children.size() > 0 ? 1 : 2;

		for (const { Name: prop } of getPropertiesToCompile(rbxClass, instance, new Set(["Parent"]))) {
			let valueStr = formatValue(instance[prop as keyof typeof instance]);
			if (valueStr.find(`^".+"$`)[0] === undefined) valueStr = `{${valueStr}}`;
			propLength += (depth + 1) * 4 + valueStr.size();
			if (prop === "Name") {
				propResults.unshift(`Key=${valueStr}`);
				propLength += 3;
			} else {
				propResults.push(`${prop}=${valueStr}`);
				propLength += prop.size();
			}
		}

		const multiline = propLength > 120;

		if (multiline) {
			results.push(`\n`);
			results.push(propResults.map((line) => indent + "\t" + line).join("\n"));
		} else {
			results.push(` `);
			results.push(propResults.join(" "));
		}

		if (children.size() > 0) {
			results.push(multiline ? `\n${indent}>` : `>`);
			for (const child of children) {
				results.push("\n");
				roactHelper(apiDump, child, results, depth + 1);
			}
			results.push("\n");
			results.push(indent);
			results.push(`</`);
			results.push(instance.ClassName.lower());
			results.push(`>`);
		} else {
			results.push(multiline ? `\n` + indent + `/>` : propResults.size() ? ` />` : `/>`);
		}
	}

	return results;
}