'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMockProgramOutcomes, useMockProgramSpecificOutcomes } from '@/hooks/obe/use-mock-obe-data';
import { Grid3x3, HelpCircle } from 'lucide-react';

// Mock course outcomes for demo
const mockCourseOutcomes = [
  { id: 'co-001', code: 'CO1', description: 'Understand basic programming concepts' },
  { id: 'co-002', code: 'CO2', description: 'Apply data structures in problem solving' },
  { id: 'co-003', code: 'CO3', description: 'Design algorithms for complex problems' },
  { id: 'co-004', code: 'CO4', description: 'Evaluate software design patterns' },
];

const CORRELATION_LEVELS = [
  { value: 0, label: 'No Mapping', color: 'bg-gray-100' },
  { value: 1, label: 'Low', color: 'bg-yellow-100' },
  { value: 2, label: 'Medium', color: 'bg-orange-100' },
  { value: 3, label: 'High', color: 'bg-green-100' },
];

export default function CoPOMappingPage() {
  const { outcomes: pos } = useMockProgramOutcomes();
  const { outcomes: psos } = useMockProgramSpecificOutcomes();
  const [courseId, setCourseId] = useState('course-001');
  const [mappings, setMappings] = useState<Record<string, Record<string, number>>>({});

  const handleCellClick = (coId: string, outcomeId: string) => {
    setMappings(prev => {
      const current = prev[coId]?.[outcomeId] ?? 0;
      const next = current === 3 ? 0 : current + 1;
      return {
        ...prev,
        [coId]: {
          ...prev[coId],
          [outcomeId]: next,
        },
      };
    });
  };

  const getCellColor = (coId: string, outcomeId: string) => {
    const level = mappings[coId]?.[outcomeId] ?? 0;
    return CORRELATION_LEVELS[level].color;
  };

  const getCellLabel = (coId: string, outcomeId: string) => {
    const level = mappings[coId]?.[outcomeId] ?? 0;
    return CORRELATION_LEVELS[level].label;
  };

  return (
    <div className='space-y-6 px-4 md:px-8 pb-24 lg:pb-0'>
      <div>
        <h1 className='text-2xl font-bold py-1'>CO-PO Mapping Matrix</h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Define the correlation between Course Outcomes and Program/Specific Outcomes
        </p>
      </div>

      {/* Course Selector */}
      <Card>
        <CardHeader>
          <Label htmlFor='course-select'>Select Course</Label>
        </CardHeader>
        <CardContent>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger id='course-select'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='course-001'>CS101 - Programming Fundamentals</SelectItem>
              <SelectItem value='course-002'>CS102 - Data Structures</SelectItem>
              <SelectItem value='course-003'>CS201 - Algorithms</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Mapping Matrix */}
      <Card>
        <CardHeader>
          <div className='flex items-start justify-between'>
            <div>
              <CardTitle>Program Outcomes Mapping</CardTitle>
              <CardDescription>
                Click cells to set correlation level: 0 = No Mapping, 1 = Low, 2 = Medium, 3 = High
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead>
              <tr className='bg-gray-50'>
                <th className='border p-2 text-left font-medium'>Course Outcome</th>
                {pos.map(po => (
                  <th
                    key={po.id}
                    className='border p-2 text-center font-medium min-w-[80px] text-xs'
                    title={po.po_description}
                  >
                    {po.po_code}
                  </th>
                ))}
                {psos.map(pso => (
                  <th
                    key={pso.id}
                    className='border p-2 text-center font-medium min-w-[80px] text-xs bg-blue-50'
                    title={pso.pso_description}
                  >
                    {pso.pso_code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockCourseOutcomes.map(co => (
                <tr key={co.id}>
                  <td className='border p-2 font-medium min-w-[250px]'>
                    <div className='font-medium text-xs'>{co.code}</div>
                    <div className='text-xs text-muted-foreground'>{co.description}</div>
                  </td>
                  {/* PO Columns */}
                  {pos.map(po => (
                    <td
                      key={`${co.id}-${po.id}`}
                      className={`border p-1 text-center cursor-pointer hover:opacity-80 transition-opacity ${getCellColor(
                        co.id,
                        po.id
                      )}`}
                      onClick={() => handleCellClick(co.id, po.id)}
                      title={`${co.code} → ${po.po_code}: ${getCellLabel(co.id, po.id)}`}
                    >
                      <div className='text-xs font-medium'>{mappings[co.id]?.[po.id] ?? 0}</div>
                    </td>
                  ))}
                  {/* PSO Columns */}
                  {psos.map(pso => (
                    <td
                      key={`${co.id}-${pso.id}`}
                      className={`border p-1 text-center cursor-pointer hover:opacity-80 transition-opacity ${getCellColor(
                        co.id,
                        pso.id
                      )}`}
                      onClick={() => handleCellClick(co.id, pso.id)}
                      title={`${co.code} → ${pso.pso_code}: ${getCellLabel(co.id, pso.id)}`}
                    >
                      <div className='text-xs font-medium'>{mappings[co.id]?.[pso.id] ?? 0}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Correlation Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {CORRELATION_LEVELS.map(level => (
              <div key={level.value} className='flex items-center gap-2'>
                <div className={`w-8 h-8 rounded border ${level.color}`} />
                <div className='text-sm'>
                  <div className='font-medium'>{level.value}</div>
                  <div className='text-xs text-muted-foreground'>{level.label}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className='bg-blue-50 border-blue-200'>
        <CardHeader>
          <div className='flex items-start gap-2'>
            <HelpCircle className='h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0' />
            <div>
              <CardTitle className='text-base'>Mapping Guidelines</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-2 text-sm text-muted-foreground'>
          <p>
            • <strong>Click any cell</strong> to cycle through correlation levels (0 → 1 → 2 → 3 → 0)
          </p>
          <p>
            • <strong>0 (Gray):</strong> No direct correlation between this CO and outcome
          </p>
          <p>
            • <strong>1 (Yellow):</strong> Weak/partial correlation — CO somewhat contributes to outcome
          </p>
          <p>
            • <strong>2 (Orange):</strong> Medium correlation — CO significantly contributes to outcome
          </p>
          <p>
            • <strong>3 (Green):</strong> Strong correlation — CO directly develops this outcome
          </p>
          <p className='pt-2'>
            💡 Every PO should have at least one CO mapped to it. If not, you'll see warnings during attainment calculation.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className='flex justify-end gap-2'>
        <Button variant='outline'>Reset</Button>
        <Button className='gap-2'>
          <Grid3x3 className='h-4 w-4' />
          Save Mappings
        </Button>
      </div>
    </div>
  );
}
