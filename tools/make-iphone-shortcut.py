# Builds the "Send to Reader" share-sheet shortcut (iPhone + Mac) with the key baked in.
#   python3 tools/make-iphone-shortcut.py ~/Library/Application\ Support/ReaderInbox/reader_key unsigned.shortcut
#   shortcuts sign --mode people-who-know-me --input unsigned.shortcut --output "Send to Reader.shortcut"
# The signed file opens on any device on the same Apple ID (e.g. from iCloud Drive). Never commit it: it holds the key.
#
# Shortcut Input must be referenced as a text token: a bare WFTextTokenAttachment in Get URLs' WFInput imports as
# an empty "Input" slot and every send arrives with no link. Run with nothing shared (Spotlight on the Mac), it
# opens Arc to Reader (tools/arc-to-reader.js), which sends Arc's current tab instead.
import plistlib, sys, uuid
key = open(sys.argv[1]).read().strip()
def U(): return str(uuid.uuid4()).upper()
EXT = {"Type": "ExtensionInput"}
def text(s): return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}
def tok(*parts):
    s, ranges = "", {}
    for p in parts:
        if isinstance(p, str): s += p
        else: ranges["{%d, 1}" % len(s)] = p; s += "￼"
    return {"Value": {"string": s, "attachmentsByRange": ranges}, "WFSerializationType": "WFTextTokenString"}
def out(u, name): return {"Type": "ActionOutput", "OutputUUID": u, "OutputName": name}
def out_var(u, name): return {"Value": out(u, name), "WFSerializationType": "WFTextTokenAttachment"}
def fields(*pairs): return {"Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": text(k), "WFValue": v} for k, v in pairs]}, "WFSerializationType": "WFDictionaryFieldValue"}
group, urls, post, msg = U(), U(), U(), U()
MAC_APP = "com.evanche.arc-to-reader"
actions = [
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
     "WFWorkflowActionParameters": {"GroupingIdentifier": group, "WFControlFlowMode": 0, "WFCondition": 101,
        "WFInput": {"Type": "Variable", "Variable": {"Value": EXT, "WFSerializationType": "WFTextTokenAttachment"}}}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.openapp",
     "WFWorkflowActionParameters": {"WFAppIdentifier": MAC_APP, "WFSelectedApp": {"BundleIdentifier": MAC_APP, "Name": "Arc to Reader"}}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.exit", "WFWorkflowActionParameters": {}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
     "WFWorkflowActionParameters": {"GroupingIdentifier": group, "WFControlFlowMode": 2, "UUID": U()}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.detect.link",
     "WFWorkflowActionParameters": {"UUID": urls, "WFInput": tok(EXT)}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
     "WFWorkflowActionParameters": {"UUID": post, "WFURL": "https://reader-inbox.vercel.app/api/save", "WFHTTPMethod": "POST",
        "ShowHeaders": True, "WFHTTPHeaders": fields(("Authorization", text("Bearer " + key))),
        # The server takes the first link in the text, so the raw input backs up Get URLs.
        "WFHTTPBodyType": "JSON", "WFJSONValues": fields(("url", tok(out(urls, "URLs"), " ", EXT)))}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
     "WFWorkflowActionParameters": {"UUID": msg, "WFGetDictionaryValueType": "Value", "WFDictionaryKey": "message", "WFInput": out_var(post, "Contents of URL")}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.notification",
     "WFWorkflowActionParameters": {"UUID": U(), "WFNotificationActionTitle": "Send to Reader", "WFNotificationActionBody": tok(out(msg, "Dictionary Value")), "WFNotificationActionSound": False}},
]
wf = {
    "WFWorkflowClientVersion": "2607.0.2", "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59446},
    "WFWorkflowImportQuestions": [], "WFWorkflowTypes": ["ActionExtension"], "WFQuickActionSurfaces": [],
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem", "WFSafariWebPageContentItem", "WFStringContentItem"],
    "WFWorkflowOutputContentItemClasses": [], "WFWorkflowHasShortcutInputVariables": True, "WFWorkflowActions": actions,
}
plistlib.dump(wf, open(sys.argv[2], "wb"), fmt=plistlib.FMT_BINARY)
