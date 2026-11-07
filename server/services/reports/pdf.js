import PDFDocument from 'pdfkit';
import Task from '../../models/Task.js';
import { GazeRecord } from '../../models/TaskData.js';
import ScreenSnapshot from '../../models/ScreenSnapshot.js';
import { buildHeatmap } from '../eyeTracking/heatmap.js';
import { detectFixations } from '../eyeTracking/fixations.js';
import { OS_NAMES } from './reportData.js';

const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
const p3 = (p) => (p === undefined || p === null ? 'n/a' : p < 0.001 ? '< 0.001' : p.toFixed(3));

function heatRGB(v) {
  const stops = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]];
  const pos = Math.min(0.999, v) * (stops.length - 1);
  const i = Math.floor(pos), f = pos - i;
  return stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
}

// A stored JPEG still of the participant's screen, or null (a neutral screen-shaped backdrop is drawn instead).
const snapshotFor = async (filter) => (await ScreenSnapshot.findOne(filter).select('data').lean())?.data || null;

function figure(doc, task, imageBuf, { heatmap, fixations }) {
  const W = 300;
  let img = null;
  try { img = imageBuf ? doc.openImage(imageBuf) : null; } catch { /* corrupt or unsupported image: neutral backdrop */ }
  const H = img ? (img.height / img.width) * W : (W * 9) / 16;
  if (doc.y + H + 40 > doc.page.height - 50) doc.addPage();
  const x = doc.page.margins.left, y = doc.y + 14;
  doc.fontSize(9).fillColor('#334155').text(`${OS_NAMES[task.operatingSystem]} · Task ${task.taskNumber}: ${task.instruction}`, x, doc.y);
  if (img) doc.image(img, x, y, { width: W });
  else doc.fillOpacity(1).fillColor('#e2e8f0').rect(x, y, W, H).fill();
  if (heatmap) {
    const cw = W / heatmap.w, ch = H / heatmap.h;
    heatmap.values.forEach((v, i) => {
      if (v < 0.08) return;
      const [r, g, b] = heatRGB(v);
      doc.fillOpacity(Math.min(0.7, 0.2 + v * 0.5)).fillColor(`rgb(${r},${g},${b})`).rect(x + (i % heatmap.w) * cw, y + Math.floor(i / heatmap.w) * ch, cw + 0.5, ch + 0.5).fill();
    });
  }
  if (fixations) {
    doc.fillOpacity(1).strokeColor('#7c3aed').lineWidth(1);
    fixations.forEach((f, i) => { const px = x + f.x * W, py = y + f.y * H; if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py); });
    doc.stroke();
    fixations.forEach((f) => {
      const px = x + f.x * W, py = y + f.y * H;
      doc.fillOpacity(0.5).fillColor('#8b5cf6').circle(px, py, Math.min(14, 4 + f.duration / 80)).fill();
      doc.fillOpacity(1).fillColor('#111').fontSize(7).text(String(f.order), px - 6, py - 3, { width: 12, align: 'center' });
    });
  }
  doc.fillOpacity(1).fillColor('#000');
  doc.y = y + H + 12;
  doc.x = x;
}

const H1 = (doc, t) => doc.moveDown(0.8).fontSize(14).fillColor('#0f1b3a').text(t).moveDown(0.3).fontSize(10).fillColor('#000');
const P = (doc, t) => doc.fontSize(10).fillColor('#000').text(t, { align: 'left' }).moveDown(0.3);
const bullets = (doc, items) => items.forEach((t) => doc.fontSize(10).text(`• ${t}`, { indent: 8 }));

function row(doc, cols, widths, bold) {
  const y = doc.y;
  if (y > doc.page.height - 70) doc.addPage();
  let x = doc.page.margins.left;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  const top = doc.y;
  cols.forEach((c, i) => { doc.text(String(c), x, top, { width: widths[i] - 4 }); x += widths[i]; });
  doc.y = top + 14;
  doc.x = doc.page.margins.left;
  doc.font('Helvetica');
}

function start(res, filename) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: filename } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

export async function writeExperimentPdf(res, r) {
  const doc = start(res, `experiment-report-${r.experiment._id}.pdf`);
  doc.fontSize(20).fillColor('#0f1b3a').text(r.title);
  doc.fontSize(9).fillColor('#64748b').text(`Generated ${r.generatedAt} · Status: ${r.experiment.status}`).moveDown();

  H1(doc, '1. Research objective'); P(doc, r.objective);
  H1(doc, '2. Methodology'); bullets(doc, r.methodology);
  H1(doc, '3. Participant demographics');
  P(doc, `Assigned: ${r.demographics.assigned} · Completed: ${r.demographics.completed} · Surveys completed: ${r.demographics.surveyCompleted}`);
  P(doc, `Age: mean ${fmt(r.demographics.age.mean)} (SD ${fmt(r.demographics.age.sd)}, n=${r.demographics.age.n}). Gender: ${JSON.stringify(r.demographics.gender)}. Primary OS: ${JSON.stringify(r.demographics.primaryOS)}.`);
  H1(doc, '4. Operating systems'); bullets(doc, r.osDescriptions.map((o) => o.name));
  H1(doc, '5. Experimental procedure'); bullets(doc, r.procedure);

  H1(doc, '6. Task completion and eye-tracking analysis (measured data)');
  const w = [170, 110, 110, 110];
  row(doc, ['Metric', 'Windows 11', 'macOS', 'Linux'], w, true);
  for (const [k, m] of Object.entries(r.taskAnalysis.metrics)) {
    const pct = k === 'successRate';
    row(doc, [m.label, ...['windows', 'macos', 'linux'].map((os) => { const s = m.byOS[os]; return s.n ? `${fmt(pct ? s.mean * 100 : s.mean)}${pct ? '%' : ''} (n=${s.n})` : 'n/a'; })], w);
  }
  doc.moveDown(0.3);
  P(doc, 'n/a = unavailable (no valid data). Webcam gaze data are approximate.');

  H1(doc, '7. SUS analysis');
  P(doc, `Reference average: ${r.sus.reference}.`);
  for (const os of ['windows', 'macos', 'linux']) { const s = r.sus.byOS[os]; P(doc, `${OS_NAMES[os]}: n=${s.n}, mean ${fmt(s.mean)}, median ${fmt(s.median)}, SD ${fmt(s.sd)}.`); }

  H1(doc, '8. Statistical analysis');
  for (const s of r.statistics) {
    const o = s.omnibus;
    P(doc, `${s.label} (${s.design}, n=${s.n}): ${o?.status === 'ok' ? `${o.test}, statistic ${fmt(o.statistic, 3)}, p ${p3(o.p)}${o.effectSize ? `, ${o.effectSize.name} ${fmt(o.effectSize.value, 3)}` : ''}` : `insufficient data (${o?.note || ''})`}`);
    (s.posthoc || []).filter((x) => x.status !== 'insufficient').forEach((x) => doc.fontSize(9).text(`   ${x.comparison}: adjusted p ${p3(x.pAdjusted ?? x.p)}`));
    doc.fontSize(9).fillColor('#64748b').text(`   ${s.interpretation}`).fillColor('#000').moveDown(0.3);
  }

  // Heatmaps: pooled participants per task, for the tasks with the most recordings.
  const grouped = await GazeRecord.aggregate([{ $match: { experimentId: r.experiment._id } }, { $group: { _id: '$taskId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]);
  H1(doc, '9. Heatmap visualisations');
  let shown = 0;
  for (const g of grouped) {
    const task = await Task.findById(g._id).lean();
    if (!task) continue;
    const recs = await GazeRecord.find({ taskId: g._id }).select('gazeSamples');
    // Pooled over participants, so any available screen still serves only as context.
    figure(doc, task, await snapshotFor({ taskId: g._id }), { heatmap: buildHeatmap(recs.flatMap((x) => x.gazeSamples)) });
    shown++;
  }
  if (!shown) P(doc, 'No heatmaps available (no gaze recordings yet).');

  H1(doc, '10. Findings (automatically generated from stored data)');
  r.generated.findings.length ? bullets(doc, r.generated.findings) : P(doc, 'Not enough data yet.');
  H1(doc, '11. Limitations'); bullets(doc, r.limitations);
  H1(doc, '12. Conclusion (automatically generated)'); P(doc, r.generated.conclusion);
  doc.end();
}

export async function writeParticipantPdf(res, r) {
  const doc = start(res, `participant-report-${r.participant.code}.pdf`);
  doc.fontSize(18).fillColor('#0f1b3a').text('Individual participant report');
  doc.fontSize(9).fillColor('#64748b').text(`${r.experiment.title} · generated ${r.generatedAt}`).moveDown();
  H1(doc, 'Participant');
  P(doc, `ID: ${r.participant.code} · Status: ${r.status} · OS order: ${r.osSequence.map((o) => OS_NAMES[o]).join(' → ')}`);
  if (r.profile) P(doc, `Primary OS: ${OS_NAMES[r.profile.primaryOS] || 'n/a'} · Familiarity (1-5): Windows ${r.profile.familiarity?.windows}, macOS ${r.profile.familiarity?.macos}, Linux ${r.profile.familiarity?.linux} · Calibration quality: ${fmt(r.calibrationQuality && r.calibrationQuality * 100, 0)}%`);
  H1(doc, 'Summary');
  P(doc, `Tasks completed: ${r.summary.tasksCompleted} · Reported complete: ${r.summary.correct} · Mean completion time (reported complete): ${fmt(r.summary.avgCompletionTime, 0)} ms`);
  P(doc, `Not completed: ${r.summary.failedTasks.length ? r.summary.failedTasks.map((f) => `${f.operatingSystem} #${f.taskNumber} (${f.reason})`).join(', ') : 'none'}`);
  H1(doc, 'Per operating system');
  const w = [60, 50, 45, 45, 40, 45, 45, 50, 50, 35];
  row(doc, ['OS', 'Completed', 'Verified', 'Time ms', 'Fix.', 'Dwell', 'TTFF', 'Revisits', 'Blink/min', 'SUS'], w, true);
  for (const os of ['windows', 'macos', 'linux']) {
    const s = r.byOS[os];
    if (!s.tasks) continue;
    row(doc, [OS_NAMES[os].split(' ')[0], s.successRate === null ? 'n/a' : `${fmt(s.successRate * 100, 0)}%`, `${s.verified}/${s.tasks}`, fmt(s.avgCompletionTime, 0), fmt(s.fixationCount), fmt(s.dwellTime, 0), fmt(s.ttff, 0), fmt(s.revisitCount), fmt(s.blinkRate), fmt(s.sus)], w);
  }
  P(doc, 'n/a = unavailable. Webcam gaze data are approximate.');
  H1(doc, 'Scan paths');
  let shown = 0;
  for (const t of r.tasks) {
    if (shown >= 8) break;
    const rec = await GazeRecord.findOne({ participantId: r.participant.participantId, taskId: t.taskId });
    const task = rec && (await Task.findById(t.taskId).lean());
    if (!task) continue;
    figure(doc, task, await snapshotFor({ participantId: r.participant.participantId, taskId: t.taskId }), { fixations: detectFixations(rec.gazeSamples).map((f, i) => ({ order: i + 1, ...f })) });
    shown++;
  }
  if (!shown) P(doc, 'No scan paths available.');
  doc.end();
}
