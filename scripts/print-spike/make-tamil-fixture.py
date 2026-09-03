import zipfile, sys

CT = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'''

FONT = "Noto Sans Tamil"

def rpr(size, bold):
    # OOXML CT_RPr sequence is fixed: rFonts, b, i, ... sz, szCs
    return (f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>'
            + ('<w:b/>' if bold else '')
            + f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>')

def para(text, size=24, bold=False, page_break_before=False):
    pb = f'<w:r>{rpr(size,bold)}<w:br w:type="page"/></w:r>' if page_break_before else ''
    return (f'<w:p><w:pPr>{rpr(size,bold)}</w:pPr>{pb}'
            f'<w:r>{rpr(size,bold)}<w:t xml:space="preserve">{text}</w:t></w:r></w:p>')

TAMIL_TITLE = "ஜெ.கெ.கெ. நட்ராஜா கல்லூரி"
TAMIL_BODY  = "மாணவர்கள் அச்சு எடுக்க வரிசையில் காத்திருக்கிறார்கள்."

body = [
    para(TAMIL_TITLE, 36, True),
    para(TAMIL_BODY),
    para("பக்கம் ஒன்று — முதல் தாள்"),
    para("English control line: the quick brown fox jumps over the lazy dog."),
    para("Mixed: Semester செமஸ்டர் 2026 - Rs. 2.00 per page"),
    para("PAGE TWO MARKER", 40, True, True),
    para(TAMIL_BODY),
    para("PAGE THREE MARKER", 40, True, True),
    para("End of document."),
]

DOC = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
       '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
       '<w:body>' + ''.join(body) +
       '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
       '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"'
       ' w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
       '</w:body></w:document>')

with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', CT)
    z.writestr('_rels/.rels', RELS)
    z.writestr('word/_rels/document.xml.rels', DOC_RELS)
    z.writestr('word/document.xml', DOC)
print("wrote", sys.argv[1])
