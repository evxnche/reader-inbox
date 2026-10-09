# Builds the iPhone "Send to Reader" share-sheet shortcut with the key baked in.
#   python3 tools/make-iphone-shortcut.py ~/Library/Application\ Support/ReaderInbox/reader_key unsigned.shortcut
#   shortcuts sign --mode people-who-know-me --input unsigned.shortcut --output "Send to Reader.shortcut"
# The signed file opens on any device on the same Apple ID (e.g. from iCloud Drive). Never commit it: it holds the key.
import plistlib, sys, uuid
key = open(sys.argv[1]).read().strip()
U = [str(uuid.uuid4()).upper() for _ in range(4)]
def text(s): return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}
def out_text(u, name): return {"Value": {"string": "￼", "attachmentsByRange": {"{0, 1}": {"Type": "ActionOutput", "OutputUUID": u, "OutputName": name}}}, "WFSerializationType": "WFTextTokenString"}
def out_var(u, name): return {"Value": {"Type": "ActionOutput", "OutputUUID": u, "OutputName": name}, "WFSerializationType": "WFTextTokenAttachment"}
def fields(*pairs): return {"Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": text(k), "WFValue": v} for k, v in pairs]}, "WFSerializationType": "WFDictionaryFieldValue"}
actions = [
    {"WFWorkflowActionIdentifier": "is.workflow.actions.detect.link",
     "WFWorkflowActionParameters": {"UUID": U[0], "WFInput": {"Value": {"Type": "ExtensionInput"}, "WFSerializationType": "WFTextTokenAttachment"}}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
     "WFWorkflowActionParameters": {"UUID": U[1], "WFURL": "https://reader-inbox.vercel.app/api/save", "WFHTTPMethod": "POST",
        "ShowHeaders": True, "WFHTTPHeaders": fields(("Authorization", text("Bearer " + key))),
        "WFHTTPBodyType": "JSON", "WFJSONValues": fields(("url", out_text(U[0], "URLs")))}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
     "WFWorkflowActionParameters": {"UUID": U[2], "WFGetDictionaryValueType": "Value", "WFDictionaryKey": "message", "WFInput": out_var(U[1], "Contents of URL")}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.notification",
     "WFWorkflowActionParameters": {"UUID": U[3], "WFNotificationActionTitle": "Send to Reader", "WFNotificationActionBody": out_text(U[2], "Dictionary Value"), "WFNotificationActionSound": False}},
]
wf = {
    "WFWorkflowClientVersion": "2607.0.2", "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 463140863, "WFWorkflowIconGlyphNumber": 59446},
    "WFWorkflowImportQuestions": [], "WFWorkflowTypes": ["ActionExtension"], "WFQuickActionSurfaces": [],
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem", "WFSafariWebPageContentItem", "WFStringContentItem"],
    "WFWorkflowOutputContentItemClasses": [], "WFWorkflowHasShortcutInputVariables": True, "WFWorkflowHasOutputFallback": False,
    "WFWorkflowActions": actions,
}
plistlib.dump(wf, open(sys.argv[2], "wb"), fmt=plistlib.FMT_BINARY)
