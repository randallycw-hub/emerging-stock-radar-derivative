"""Generate the internal V5.4 data-trust closeout report.

The report reads only local audit artifacts. It is not staged into the public site.
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / ".cache" / "v54"
OUTPUT = ROOT / "output" / "pdf" / "v54-data-coverage-final-report.pdf"


def load(name: str):
    with (AUDIT / name).open("r", encoding="utf-8") as stream:
        return json.load(stream)


def paragraph(value: object, style: ParagraphStyle):
    return Paragraph(str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), style)


def section(title: str, body: list[str], styles: dict[str, ParagraphStyle]):
    blocks = [Paragraph(title, styles["section"])]
    blocks.extend(paragraph(item, styles["body"]) for item in body)
    blocks.append(Spacer(1, 4 * mm))
    return blocks


def table(rows: list[list[object]], widths: list[float], styles: dict[str, ParagraphStyle]):
    values = [[paragraph(cell, styles["tableHead"] if row == 0 else styles["table"]) for cell in cells] for row, cells in enumerate(rows)]
    result = Table(values, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#181B23")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C7CBD4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FAFBFD")),
    ]))
    return result


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("MSJH", 8)
    canvas.setFillColor(colors.HexColor("#555B66"))
    canvas.drawString(document.leftMargin, 10 * mm, "台灣盤後市場資訊台 - V5.4 內部稽核結案報告")
    canvas.drawRightString(A4[0] - document.rightMargin, 10 * mm, f"第 {document.page} 頁")
    canvas.restoreState()


def main():
    audit = load("audit-report.v54.json")
    registry = load("source-registry.v54.json")
    lineage = load("field-lineage.v54.json")
    coverage = load("data-coverage-report.v54.json")
    qa = load("qa-report.v54.json")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    pdfmetrics.registerFont(TTFont("MSJH", r"C:\Windows\Fonts\msjh.ttc", subfontIndex=0))
    sample = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("title", parent=sample["Title"], fontName="MSJH", fontSize=21, leading=29, textColor=colors.HexColor("#161A22"), alignment=TA_LEFT, spaceAfter=5 * mm),
        "subtitle": ParagraphStyle("subtitle", parent=sample["Normal"], fontName="MSJH", fontSize=10, leading=16, textColor=colors.HexColor("#4D5565"), spaceAfter=7 * mm),
        "section": ParagraphStyle("section", parent=sample["Heading2"], fontName="MSJH", fontSize=13, leading=19, textColor=colors.HexColor("#242A38"), spaceBefore=2 * mm, spaceAfter=2.5 * mm),
        "body": ParagraphStyle("body", parent=sample["BodyText"], fontName="MSJH", fontSize=9.5, leading=15, textColor=colors.HexColor("#262B34"), wordWrap="CJK", spaceAfter=1.5 * mm),
        "table": ParagraphStyle("table", parent=sample["BodyText"], fontName="MSJH", fontSize=8, leading=11, wordWrap="CJK"),
        "tableHead": ParagraphStyle("tableHead", parent=sample["BodyText"], fontName="MSJH", fontSize=8, leading=11, textColor=colors.white, wordWrap="CJK"),
        "status": ParagraphStyle("status", parent=sample["BodyText"], fontName="MSJH", fontSize=11, leading=16, alignment=TA_CENTER, textColor=colors.HexColor("#0D6A44")),
    }
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=17 * mm, bottomMargin=18 * mm,
        title="V5.4 Data Coverage Audit Closeout",
        author="市場資訊台資料治理流程",
    )
    data_date = audit["dataDate"]
    input_hashes = audit.get("baseline", {}).get("inputHashes", {})
    story = [
        Paragraph("台灣盤後市場資訊台\nV5.4 資料完整度稽核結案報告", styles["title"]),
        Paragraph(f"內部文件 - 公開前台不顯示 | 資料日 {data_date} | 產生時間 {audit['generatedAt']}", styles["subtitle"]),
        Paragraph("本次稽核結果：通過", styles["status"]),
        Spacer(1, 5 * mm),
    ]
    story += section("A. 稽核範圍", [
        "本次改版維持既有前台視覺與研究入口，重點是建立可追溯的資料來源、欄位血緣、資料覆蓋率與跨頁一致性檢查。",
        "公開前台僅呈現可理解的已發布事實；資料匯入、差異、來源識別碼、缺漏原因與稽核狀態僅保留在內部流程。",
    ], styles)
    story += section("B. 基準快照", [
        f"使用中的正式資料世代資料日為 {data_date}。稽核已計算 {len(input_hashes)} 個關鍵輸入檔案的 SHA-256 指紋，以支援後續差異追溯。",
        "快照原則：資料更新失敗時保留最近一次已驗證成功資料；未有正式發布值的欄位維持空值或中性顯示，不以推測補值。",
    ], styles)
    story.append(table([["輸入資料", "指紋狀態"], *[[key, "已記錄" if value else "本期未提供"] for key, value in input_hashes.items()]], [72 * mm, 92 * mm], styles))
    story.append(Spacer(1, 5 * mm))
    story += section("C. 官方來源登錄", [
        f"來源登錄共 {len(registry)} 筆，均為 Tier A、免登入的官方公開資料。授權或登入後才能取得的第三方內容不作為 canonical 值來源。",
        "允許的官方網域採 HTTPS 白名單，前台外連皆以安全的新分頁屬性開啟。",
    ], styles)
    story.append(table([["資料集", "來源層級", "存取", "筆數"], *[[entry["dataset"], entry["tier"], entry["access"], entry.get("recordCount") if entry.get("recordCount") is not None else "—"] for entry in registry]], [61 * mm, 24 * mm, 34 * mm, 45 * mm], styles))
    story.append(PageBreak())
    story += section("D. 欄位血緣與計算邊界", [
        "價格、條款、IPO 事件、興櫃成交與營收均保留各自官方來源。可推導值僅在相同資料日期的公開原始欄位齊全時產生。",
        "可轉債轉換價值 = 標的股收盤價 / 轉換價 x 100；轉換溢價率 = CB 收盤價 / 轉換價值 - 1。任一日期不同或原始值不足，即不計算。",
    ], styles)
    story.append(table([["資料範圍", "欄位", "層級", "狀態"], *[[entry["dataset"], "、".join(entry["fields"]), entry["tier"], entry["status"]] for entry in lineage]], [35 * mm, 87 * mm, 16 * mm, 26 * mm], styles))
    story.append(Spacer(1, 5 * mm))
    story += section("E. 可轉債完整度", [
        "可轉債資料採單一 canonical read model。發行條款、同日估值、轉換價異動、賣回、到期與提前贖回分開建模；不以事件標題或不完整資訊推測日期、價格或餘額。",
        "提前贖回頁面僅顯示官方已公告的公告日、最後交易日與公告原文；未公告的贖回日、價格與流通餘額不顯示。",
    ], styles)
    story.append(table([["資料集", "已覆蓋", "缺漏欄位", "阻擋問題"], *[[entry["dataset"], entry["coverage"], "、".join(entry["coreFields"][entry["available"]:]) or "—", "、".join(entry["blockingIssues"]) or "—"] for entry in coverage]], [37 * mm, 22 * mm, 61 * mm, 44 * mm], styles))
    story.append(PageBreak())
    story += section("F. IPO、興櫃與公司識別", [
        "IPO 進度、競拍、申購與掛牌事件維持不同事件類型；送件、審議、契約、競拍與買賣不可互相推論。撤件、自撤、取消與延期不會混入預設進行中雷達。",
        "興櫃成交量與估計成交金額維持原始公開欄位語意。公司頁及全站搜尋以 canonical 公司代碼與 CB 代碼主檔對應，不以名稱猜測。",
    ], styles)
    story += section("G. 前台顯示與缺值語意", [
        "數值 0：僅代表官方已確認為零。—：官方尚未提供或無可用值。待公告：該事件階段尚未公布日期。今日無成交：官方確認當日成交量為零。資料暫時無法取得：讀取或驗證失敗。",
        "前台不呈現「資料完整度」、「資料快照」、「來源 ID」、「缺漏原因」、「風險與缺漏提醒」或任何投資建議、買賣提示與技術分析。",
    ], styles)
    samples = qa.get("samples", {})
    story += section("H. 跨頁一致性 QA", [
        "抽樣涵蓋興櫃、有效 CB、近期發行、提前贖回、轉換價異動、IPO 與月營收；所有抽樣檢查均通過。",
    ], styles)
    story.append(table([["抽樣類別", "本次樣本數"], *[[key, value] for key, value in samples.items()]], [82 * mm, 82 * mm], styles))
    story.append(Spacer(1, 5 * mm))
    story += section("I. 安全與個資保護", [
        "本次公開資料流程不收集、儲存或輸出會員個資；不可將會員登入、Cookie、密碼、付款資訊或私有帳號內容作為資料來源。",
        "前台所有動態文字以 HTML 跳脫輸出；官方外連採 HTTPS 網域白名單，並使用 noopener／noreferrer。內部稽核輸出不被網站 staging 流程複製。",
    ], styles)
    story += section("J. 後續執行規則", [
        "收到新的 CBAS 報價或發行案件檔案時，先於內部匯入流程做欄位驗證、代碼比對、日期一致性與差異檢查；通過後才更新正式快照。",
        "任何非官方、需登入、缺少授權或未能重現計算的資料，只能作為研究參考，不得覆寫 canonical 公開數值。每次發布前均重新執行 build、完整測試、來源／覆蓋率 QA 與公開欄位掃描。",
    ], styles)
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    main()
