#!/usr/bin/env python3
"""
Собирает команду iPhone «Пиксель» (Siri) и подписывает её. Запускать на Mac: подпись есть только там.

  python3 scripts/build-siri-shortcut.py

Результат — public/siri/Пиксель.shortcut (сайт раздаёт его как есть). Что делает команда:
ключ (спрашивается при установке) → диктовка по-русски → POST /api/siri/plan → если есть что записать,
«Выбрать из списка» (всё отмечено) → POST /api/siri/apply → Siri зачитывает итог; иначе зачитывает ответ.
"""
import os
import plistlib
import subprocess
import tempfile
import uuid

API = os.environ.get('PIXEL_API', 'https://92-63-103-91.sslip.io/api')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'siri', 'Пиксель.shortcut')
SLOT = '￼'  # место переменной в тексте


def uid():
    return str(uuid.uuid4()).upper()


def out(ref, name):
    return {'OutputUUID': ref, 'OutputName': name, 'Type': 'ActionOutput'}


def text(*parts):
    """Текст с переменными: строки как есть, кортеж (uuid, имя) — вывод действия."""
    s, att = '', {}
    for p in parts:
        if isinstance(p, tuple):
            att[f'{{{len(s)}, 1}}'] = out(*p)
            s += SLOT
        else:
            s += p
    return {'Value': {'string': s, 'attachmentsByRange': att}, 'WFSerializationType': 'WFTextTokenString'}


def var(ref, name):
    return {'Value': out(ref, name), 'WFSerializationType': 'WFTextTokenAttachment'}


def fields(pairs):
    return {
        'Value': {'WFDictionaryFieldValueItems': [{'WFItemType': 0, 'WFKey': text(k), 'WFValue': text(*v)} for k, v in pairs]},
        'WFSerializationType': 'WFDictionaryFieldValue',
    }


def action(ident, **params):
    return {'WFWorkflowActionIdentifier': f'is.workflow.actions.{ident}', 'WFWorkflowActionParameters': params}


KEY, HEARD, PLAN, MODE, SAY, PID, ITEMS, CHOSEN, APPLIED, DONE = (uid() for _ in range(10))
GROUP = uid()
key = (KEY, 'Text')
auth = fields([('Authorization', ['Bearer ', key])])


def get(ref, src, k):
    return action('getvalueforkey', UUID=ref, WFInput=var(src, 'Contents of URL'), WFGetDictionaryValueType='Value', WFDictionaryKey=k)


def speak(*parts):
    return action('speaktext', WFText=text(*parts), WFSpeakTextLanguage='ru-RU', WFSpeakTextWait=True)


actions = [
    action('gettext', UUID=KEY, WFTextActionText=''),
    action('dictatetext', UUID=HEARD, WFSpeechLanguage='ru-RU', WFDictateTextStopListening='After Pause'),
    action('downloadurl', UUID=PLAN, WFURL=f'{API}/siri/plan', WFHTTPMethod='POST', WFHTTPBodyType='JSON', ShowHeaders=True, WFHTTPHeaders=auth, WFJSONValues=fields([('text', [(HEARD, 'Dictated Text')])])),
    get(MODE, PLAN, 'mode'),
    get(SAY, PLAN, 'say'),
    get(PID, PLAN, 'id'),
    action('conditional', GroupingIdentifier=GROUP, WFControlFlowMode=0, WFCondition=4, WFConditionalActionString='ask', WFInput={'Type': 'Variable', 'Variable': var(MODE, 'Dictionary Value')}),
    get(ITEMS, PLAN, 'items'),
    action('choosefromlist', UUID=CHOSEN, WFInput=var(ITEMS, 'Dictionary Value'), WFChooseFromListActionPrompt=text((SAY, 'Dictionary Value')), WFChooseFromListActionSelectMultiple=True, WFChooseFromListActionSelectAll=True),
    action('downloadurl', UUID=APPLIED, WFURL=f'{API}/siri/apply', WFHTTPMethod='POST', WFHTTPBodyType='JSON', ShowHeaders=True, WFHTTPHeaders=auth, WFJSONValues=fields([('id', [(PID, 'Dictionary Value')]), ('items', [(CHOSEN, 'Chosen Item')])])),
    get(DONE, APPLIED, 'say'),
    speak((DONE, 'Dictionary Value')),
    action('conditional', GroupingIdentifier=GROUP, WFControlFlowMode=1),
    speak((SAY, 'Dictionary Value')),
    action('conditional', GroupingIdentifier=GROUP, WFControlFlowMode=2),
]

workflow = {
    'WFWorkflowActions': actions,
    'WFWorkflowClientVersion': '2302.0.4',
    'WFWorkflowMinimumClientVersion': 900,
    'WFWorkflowMinimumClientVersionString': '900',
    'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59446},
    'WFWorkflowImportQuestions': [
        {'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'Text': 'Вставьте ключ из приложения PIXEL PLANNER — он уже скопирован', 'DefaultValue': ''},
    ],
    'WFWorkflowInputContentItemClasses': [],
    'WFWorkflowOutputContentItemClasses': [],
    'WFWorkflowTypes': [],
    'WFWorkflowHasShortcutInputVariables': False,
    'WFQuickActionSurfaces': [],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    raw = os.path.join(tmp, 'raw.shortcut')
    with open(raw, 'wb') as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
    subprocess.run(['shortcuts', 'sign', '-m', 'anyone', '-i', raw, '-o', OUT], check=True, stderr=subprocess.DEVNULL)
print('готово:', os.path.normpath(OUT), os.path.getsize(OUT), 'байт')
