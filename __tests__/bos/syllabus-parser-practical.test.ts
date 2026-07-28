/**
 * Practical (lab) paper import — course_content dual shape.
 * Regression: uploading a lab template whose experiments sit in the Units
 * sheet's Sub-topic column (Unit column blank) imported NO course content,
 * because parseUnitsSheet skips unit-less rows. Also covers the dedicated
 * "Practical Topics" sheet the exporter writes, which the importer never read.
 */
import { describe, it, expect } from 'vitest';
import { parseSyllabusSheets, parseSyllabusSheetsWithWarnings, summarise } from '@/lib/utils/bos/syllabus-parser';

// Shape of C:\tmp\26GES13_DEVICES_AND_CIRCUITS_LABORATORY_syllabus-template.xlsx
const labUnitsSheet = [
  ['Unit *', 'Title', 'Chapter', 'Sections', 'Sub-topic', 'Remarks'],
  ['', '', '', '', '', 'List of Experiments (Total: 60 Hours)'],
  ['', '', '', '', 'Characteristics of PN junction & Zener Diode.', ''],
  ['', '', '', '', 'Input and Output Characteristics of BJT.', ''],
  ['', '', '', '', 'Verification of KVL & KCL.', ''],
];

describe('practical paper import', () => {
  it('salvages unit-less Sub-topic rows on the Units sheet as practical topics', () => {
    const parsed = parseSyllabusSheets({ Units: labUnitsSheet });
    expect(parsed.course_content.units).toHaveLength(0);
    expect(parsed.course_content.is_practical).toBe(true);
    expect(parsed.course_content.topics).toEqual([
      { number: 1, title: 'Characteristics of PN junction & Zener Diode.' },
      { number: 2, title: 'Input and Output Characteristics of BJT.' },
      { number: 3, title: 'Verification of KVL & KCL.' },
    ]);
  });

  it('reads the dedicated Practical Topics sheet', () => {
    const parsed = parseSyllabusSheets({
      'Practical Topics': [
        ['S.No', 'Experiment / Topic'],
        ['1', 'Study of CRO'],
        ['2', 'Half-wave rectifier'],
        ['3', ''],
      ],
    });
    expect(parsed.course_content.is_practical).toBe(true);
    expect(parsed.course_content.topics).toEqual([
      { number: 1, title: 'Study of CRO' },
      { number: 2, title: 'Half-wave rectifier' },
    ]);
  });

  it('keeps theory mode when units exist alongside a practical sheet', () => {
    const parsed = parseSyllabusSheets({
      Units: [
        ['Unit *', 'Title', 'Chapter', 'Sections', 'Sub-topic', 'Remarks'],
        ['I', 'Equations', 'Reciprocal Equations', '1.1', '', ''],
      ],
      'Practical Topics': [
        ['S.No', 'Experiment / Topic'],
        ['1', 'Experiment 1: Basic measurements and observations'],
      ],
    });
    expect(parsed.course_content.units).toHaveLength(1);
    // topics are carried (Theory + Practical courses) but mode is NOT forced
    expect(parsed.course_content.is_practical).toBeUndefined();
    expect(parsed.course_content.topics).toHaveLength(1);
  });

  it('does not warn "Units sheet had no valid rows" when topics were salvaged', () => {
    const { warnings } = parseSyllabusSheetsWithWarnings({ Units: labUnitsSheet });
    expect(warnings.filter((w) => w.section === 'Units')).toHaveLength(0);
  });

  it('counts practical topics in the summary', () => {
    const parsed = parseSyllabusSheets({ Units: labUnitsSheet });
    expect(summarise(parsed).practical_topics).toBe(3);
    expect(summarise(parsed).units).toBe(0);
  });

  // Engineering sheets use the numeric 1/2/3 correlation scale; only H/M/L was
  // accepted before, silently emptying every engineering PO mapping on import.
  it('accepts numeric 1/2/3 PO-mapping values alongside H/M/L', () => {
    const parsed = parseSyllabusSheets({
      PO_Mapping: [
        ['CO', 'PO1', 'PO2', 'PSO1', 'PSO2'],
        ['CO1', '', '', '', ''],
        ['CO2', '3', '', '2', ''],
        ['CO3', 'H', '2', '', 'L'],
        ['CO4', '5', 'x', '', ''], // out-of-scale values still rejected
      ],
    });
    const byId = Object.fromEntries(parsed.po_mappings.mappings.map((m) => [m.co_id, m]));
    expect(byId.CO2.pos).toEqual({ PO1: '3' });
    expect(byId.CO2.psos).toEqual({ PSO1: '2' });
    expect(byId.CO3.pos).toEqual({ PO1: 'H', PO2: '2' });
    expect(byId.CO3.psos).toEqual({ PSO2: 'L' });
    expect(byId.CO4.pos).toEqual({});
  });
});
