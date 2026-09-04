import PDFDocument from "pdfkit";

import type { BriefSection, Claim, DiligenceBrief, SourceRef } from "./types";

const ORANGE = "#E98428";
const BLUE = "#607C9A";
const INK = "#2B2627";
const MUTED = "#5C5555";
const CREAM = "#F7EAD5";
const PANEL = "#F6F5F4";
const RULE = "#DDD8D5";
const CORBITS_MARK_PATH =
  "M392.899 189.107L397.586 197.031C397.586 197.031 399.539 202.891 399.539 204.844L403.094 222.422C407 222.813 407.39 226.328 409.734 227.109C412.078 228.281 415.203 231.797 416.765 235.313C417.156 236.875 418.718 240.781 420.671 244.688C422.234 247.422 422.625 250.156 424.578 251.719L426.921 254.062C432.39 258.359 432.781 261.484 433.171 272.422C432.781 280.625 434.734 295.078 435.906 301.328C436.296 302.891 436.296 302.891 437.468 303.281C438.25 304.063 437.078 302.891 437.859 303.281C439.031 304.063 443.328 304.844 449.187 307.188C451.921 307.969 454.265 309.141 455.046 313.828C456.609 320.469 464.421 350.938 467.156 369.688L468.328 385.313L447.977 371.026C443.68 353.057 435.867 327.667 433.914 323.76C431.57 321.026 423.758 320.245 419.461 319.463C416.336 319.073 413.992 317.12 412.43 312.042C412.43 308.135 411.649 301.495 410.086 292.51C408.914 285.088 408.914 281.182 408.914 277.276C408.914 272.198 406.57 270.245 400.32 263.995L397.977 259.307C391.336 246.807 390.945 244.854 387.039 244.073C385.376 244.024 384.994 238.473 383.562 235.313C383.562 234.141 384.734 231.016 383.562 225.156L368.288 212.656C361.648 212.266 357.352 225.825 353.445 232.466L348.367 244.966L342.899 261.372L341.727 263.326L340.555 266.06L330.008 281.294L326.102 287.544L324.93 289.107L317.117 299.263L308.524 309.029L291.727 327.779L287.039 334.029L284.305 335.982L270.242 352.779L267.508 355.513L265.555 358.638L264.383 359.81L256.18 368.404L248.367 375.044L246.805 376.607L241.336 380.904C238.602 384.029 231.57 384.531 228.055 384.531C225.71 382.578 216.248 381.938 217.508 379.62L226.883 372.588L228.836 371.026L234.695 364.776L237.039 362.432L242.508 357.354C247.195 352.667 251.102 349.151 253.055 340.948C254.227 336.651 264.383 326.104 268.289 321.807L269.07 321.417L295.242 293.682L315.273 261.372L318.397 253.56C320.35 249.654 320.741 247.086 321.522 244.464C322.013 242.815 326.6 216.563 324.93 212.656C323.26 208.75 332.088 195.551 326.209 189.721C323.866 187.768 320.35 185.815 318.397 183.862C313.507 178.972 300.038 175.659 301.6 169.409L300.711 159.81C303.445 148.482 306.57 135.982 303.445 135.982C301.492 135.982 290.945 149.654 286.258 155.513L285.086 156.685C276.883 168.013 266.336 177.779 258.133 191.841L242.899 218.404L237.039 226.997C235.476 228.281 229.617 232.188 227.663 232.188C221.804 228.281 222.586 225.825 217.508 234.419L203.055 260.201L201.492 264.107L200.711 265.279L197.977 270.357L196.414 273.872L182.742 296.919L173.758 314.107L170.242 319.185L168.68 321.919L167.117 323.984L163.992 327.779C163.958 327.968 156.476 332.069 155.399 331.797C154.321 331.525 148.835 329.953 147.586 327.779C146.337 325.605 148.281 323.835 149.149 322.7C154.227 316.06 153.445 310.313 153.445 308.359C153.445 306.406 151.492 298.594 151.492 296.641C151.492 294.688 151.102 294.688 151.492 284.922C152.274 273.594 143.289 274.654 144.852 265.279C145.633 259.029 146.414 251.216 143.289 253.56C141.727 253.56 129.617 266.841 124.149 273.482L114.774 285.982L99.5392 305.122L96.0236 308.247L90.5548 313.716L87.4298 315.669C84.6954 319.966 77.2736 323.091 73.3673 329.732L67.1173 340.279L64.7736 344.966L61.6486 349.654L60.4767 350.826L57.7423 355.513L55.3986 358.247L42.1173 375.826L35.0861 383.247C33.7739 384.117 33.1434 384.48 32.3517 384.531C31.5599 384.582 32.3525 374.383 32.3525 374.383L33.1329 370.859L33.9142 369.185C36.6486 363.325 41.3361 357.076 46.0236 350.826C51.1017 343.404 57.3517 329.732 63.6017 320.747L68.6798 316.06L75.3204 308.247C78.0548 306.294 81.9611 301.997 86.2579 296.529L87.8204 295.357L94.8517 286.763C100.711 278.56 116.727 261.372 126.492 251.997L128.055 249.766L130.789 247.31C137.43 241.451 143.68 233.247 148.758 233.247C156.961 233.638 162.43 240.279 167.117 244.966L184.305 261.372C185.867 262.935 187.43 262.154 188.211 260.591C200.32 237.935 210.867 216.841 219.461 216.06H226.492L229.617 213.716C236.258 202.779 244.07 187.935 250.711 178.169C258.524 167.622 283.914 134.81 298.758 121.138C302.274 117.232 305.008 115.781 307.742 115C311.649 115 315.555 116.841 319.07 119.575C333.524 131.685 356.961 157.857 366.336 168.404L372.195 173.091L387.039 181.294L390.556 185.313L392.899 189.107Z";

export function renderDiligencePdf(
  brief: DiligenceBrief,
): Promise<Buffer> {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 54, right: 54, bottom: 90, left: 54 },
    bufferPages: true,
    info: {
      Title: `${brief.company} diligence brief`,
      Author: "Corbits",
      Creator: "Corbits Diligence",
      Subject: "Sourced diligence brief",
    },
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));

  const render = () => {
    const pageWidth = document.page.width;
    const contentWidth = pageWidth - 108;
    const paintPaper = () => {
      document
        .save()
        .rect(0, 0, document.page.width, document.page.height)
        .fill("#FFFFFF")
        .restore();
    };
    paintPaper();
    document.on("pageAdded", paintPaper);

    // Exact Corbits mark vendored from the same brand source used by Scout.
    document.rect(54, 46, 36, 36).fill(CREAM);
    document
      .save()
      .translate(54, 46)
      .scale(36 / 500)
      .fillColor(ORANGE)
      .path(CORBITS_MARK_PATH)
      .fill()
      .restore();
    document
      .fillColor(ORANGE)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text("corbits", 102, 49);
    document
      .fillColor(BLUE)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text("SOURCED DILIGENCE", 102, 68, { characterSpacing: 1.2 });

    document
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(28)
      .text(brief.company, 54, 112, { width: contentWidth });
    document
      .fillColor(BLUE)
      .font("Helvetica")
      .fontSize(9.5)
      .text(brief.website, { link: brief.website, underline: true });
    document
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`SOURCED DILIGENCE BRIEF  •  ${brief.asOf.slice(0, 10)}`);

    const ruleY = document.y + 13;
    document.rect(54, ruleY, contentWidth, 3).fill(ORANGE);
    document.y = ruleY + 22;

    const panelTextWidth = contentWidth - 32;
    const summaryHeight = document
      .font("Helvetica-Bold")
      .fontSize(12)
      .heightOfString(brief.summary, { width: panelTextWidth });
    const rationaleHeight = document
      .font("Helvetica")
      .fontSize(10.5)
      .heightOfString(brief.rationale, { width: panelTextWidth });
    const panelHeight = 39 + summaryHeight + 10 + rationaleHeight + 24;
    const panelY = document.y;
    const summaryY = panelY + 39;
    document.roundedRect(54, panelY, contentWidth, panelHeight, 4).fill(PANEL);
    document.rect(54, panelY, 4, panelHeight).fill(ORANGE);
    document
      .fillColor(ORANGE)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(brief.verdict.toUpperCase(), 70, panelY + 17, {
        characterSpacing: 1.1,
      });
    document
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(brief.summary, 70, summaryY, { width: panelTextWidth });
    document
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10.5)
      .text(brief.rationale, 70, summaryY + summaryHeight + 10, {
        width: panelTextWidth,
      });
    document.y = panelY + panelHeight + 24;

    for (const section of brief.sections) writeBriefSection(document, section);

    if (brief.risks?.length) writeTextList(document, "Key risks", brief.risks);
    if (brief.questions?.length) writeTextList(document, "Questions to resolve", brief.questions);
    writeSources(document, orderedSources(brief));

    const pages = document.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      document.switchToPage(index);
      document.page.margins.bottom = 54;
      const footerY = document.page.height - 68;
      document.moveTo(54, footerY - 9).lineTo(pageWidth - 54, footerY - 9).strokeColor(RULE).stroke();
      document
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text("corbits  •  sourced diligence", 54, footerY, { lineBreak: false });
      document.text(`${index + 1} / ${pages.count}`, pageWidth - 104, footerY, {
        width: 50,
        align: "right",
        lineBreak: false,
      });
    }

    document.end();
  };

  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    try {
      render();
    } catch (cause) {
      reject(cause);
    }
  });
  return complete;
}

function writeHeading(document: PDFKit.PDFDocument, title: string): void {
  document
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(title);
  const y = document.y + 3;
  document.moveTo(54, y).lineTo(document.page.width - 54, y).strokeColor(RULE).stroke();
  document.y = y + 9;
}

function writeBriefSection(document: PDFKit.PDFDocument, section: BriefSection): void {
  writeHeading(document, section.title);
  if (section.body) {
    document
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10.5)
      .text(section.body)
      .moveDown(0.4);
  }

  for (const claim of section.claims) writeClaim(document, claim);

  for (const subsection of section.subsections ?? []) {
    document
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(subsection.title)
      .moveDown(0.15);
    document
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(subsection.body)
      .moveDown(0.3);
    for (const claim of subsection.claims) writeClaim(document, claim);
  }

  document.moveDown(0.65);
}

function writeClaim(
  document: PDFKit.PDFDocument,
  claim: Claim,
): void {
  document.fillColor(ORANGE).font("Helvetica-Bold").fontSize(10.5).text("•", {
    continued: true,
  });
  document.fillColor(INK).font("Helvetica").text(`  ${claim.text}`);
  const sourceText = claim.sources.map((source) => source.title).join(" · ");
  if (sourceText) {
    const firstLink = claim.sources.find((source) => source.url)?.url;
    document
      .fontSize(8.5)
      .fillColor(BLUE)
      .text(sourceText, firstLink ? { link: firstLink, underline: true } : {})
      .fillColor(INK);
  }
  document.moveDown(0.4);
}

function writeTextList(document: PDFKit.PDFDocument, title: string, items: string[]): void {
  writeHeading(document, title);
  document.fillColor(INK).font("Helvetica").fontSize(10.5);
  for (const item of items) document.text(`•  ${item}`, { indent: 4 }).moveDown(0.25);
  document.moveDown(0.4);
}

function orderedSources(brief: DiligenceBrief): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  const add = (claims: Claim[]) => claims.forEach((claim) => claim.sources.forEach((source) => {
    if (!seen.has(source.id)) seen.set(source.id, source);
  }));
  add(brief.claims);
  for (const section of brief.sections) {
    add(section.claims);
    for (const subsection of section.subsections ?? []) add(subsection.claims);
  }
  return [...seen.values()];
}

function writeSources(document: PDFKit.PDFDocument, sources: SourceRef[]): void {
  if (!sources.length) return;
  writeHeading(document, "Sources");
  for (const [index, source] of sources.entries()) {
    document
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(`[${index + 1}] ${source.title}`, source.url ? { link: source.url, underline: true } : {})
      .fillColor(INK)
      .moveDown(0.25);
  }
}
