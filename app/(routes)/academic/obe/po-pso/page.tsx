'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMockProgramOutcomes, useMockProgramSpecificOutcomes } from '@/hooks/obe/use-mock-obe-data';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function POPSOPage() {
  const { data: institutionCtx } = useInstitutionContext();
  const institutionId = institutionCtx?.myjkkn_id ?? '';

  const { outcomes: pos, addOutcome: addPO, updateOutcome: updatePO, deleteOutcome: deletePO } = useMockProgramOutcomes();
  const { outcomes: psos, addOutcome: addPSO, updateOutcome: updatePSO, deleteOutcome: deletePSO } = useMockProgramSpecificOutcomes();

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [psoDialogOpen, setPsoDialogOpen] = useState(false);
  const [poFormData, setPoFormData] = useState({ code: '', description: '', category: '' });
  const [psoFormData, setPsoFormData] = useState({ code: '', description: '' });

  const handleAddPO = async () => {
    if (!poFormData.code || !poFormData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await addPO({
        institution_id: institutionId,
        program_id: 'prog-001',
        po_code: poFormData.code,
        po_description: poFormData.description,
        po_category: poFormData.category || undefined,
        sort_order: pos.length + 1,
        is_active: true,
      });
      setPoFormData({ code: '', description: '', category: '' });
      setPoDialogOpen(false);
      toast.success('Program Outcome added successfully');
    } catch (error) {
      toast.error('Failed to add PO');
    }
  };

  const handleAddPSO = async () => {
    if (!psoFormData.code || !psoFormData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await addPSO({
        institution_id: institutionId,
        program_id: 'prog-001',
        pso_code: psoFormData.code,
        pso_description: psoFormData.description,
        sort_order: psos.length + 1,
        is_active: true,
      });
      setPsoFormData({ code: '', description: '' });
      setPsoDialogOpen(false);
      toast.success('Program Specific Outcome added successfully');
    } catch (error) {
      toast.error('Failed to add PSO');
    }
  };

  return (
    <div className='space-y-6 px-4 md:px-8 pb-24 lg:pb-0'>
      <div>
        <h1 className='text-2xl font-bold py-1'>Program Outcomes & PSOs</h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Define program-level competencies and program-specific outcomes
        </p>
      </div>

      {/* Program Outcomes Section */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>Program Outcomes (POs)</CardTitle>
            <CardDescription>
              Graduate-level competencies. NBA provides 12 standard POs for engineering.
            </CardDescription>
          </div>
          <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
            <DialogTrigger asChild>
              <Button size='sm' className='gap-1'>
                <Plus className='h-4 w-4' />
                Add PO
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Program Outcome</DialogTitle>
                <DialogDescription>Add a new program outcome to your curriculum</DialogDescription>
              </DialogHeader>
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='po-code'>PO Code</Label>
                  <Input
                    id='po-code'
                    placeholder='e.g., PO13'
                    value={poFormData.code}
                    onChange={e => setPoFormData({ ...poFormData, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor='po-desc'>Description</Label>
                  <Textarea
                    id='po-desc'
                    placeholder='Describe this program outcome...'
                    value={poFormData.description}
                    onChange={e => setPoFormData({ ...poFormData, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor='po-cat'>Category (Optional)</Label>
                  <Input
                    id='po-cat'
                    placeholder='e.g., Technical, Soft Skills'
                    value={poFormData.category}
                    onChange={e => setPoFormData({ ...poFormData, category: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddPO} className='w-full'>
                  Create PO
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className='w-16'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos.map(po => (
                  <TableRow key={po.id}>
                    <TableCell className='font-medium'>{po.po_code}</TableCell>
                    <TableCell className='max-w-md'>{po.po_description}</TableCell>
                    <TableCell>
                      <span className='inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded'>
                        {po.po_category || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className='flex gap-2'>
                        <Button size='sm' variant='ghost' className='h-8 w-8 p-0'>
                          <Edit2 className='h-4 w-4' />
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-8 w-8 p-0 text-red-600 hover:text-red-700'
                          onClick={() => deletePO(po.id)}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Program Specific Outcomes Section */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>Program Specific Outcomes (PSOs)</CardTitle>
            <CardDescription>
              Specialized competencies unique to your degree program
            </CardDescription>
          </div>
          <Dialog open={psoDialogOpen} onOpenChange={setPsoDialogOpen}>
            <DialogTrigger asChild>
              <Button size='sm' className='gap-1'>
                <Plus className='h-4 w-4' />
                Add PSO
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Program Specific Outcome</DialogTitle>
                <DialogDescription>Add a new program-specific outcome</DialogDescription>
              </DialogHeader>
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='pso-code'>PSO Code</Label>
                  <Input
                    id='pso-code'
                    placeholder='e.g., PSO1'
                    value={psoFormData.code}
                    onChange={e => setPsoFormData({ ...psoFormData, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor='pso-desc'>Description</Label>
                  <Textarea
                    id='pso-desc'
                    placeholder='Describe this program-specific outcome...'
                    value={psoFormData.description}
                    onChange={e => setPsoFormData({ ...psoFormData, description: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddPSO} className='w-full'>
                  Create PSO
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className='w-16'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {psos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className='text-center text-muted-foreground py-4'>
                      No PSOs defined yet. Click "Add PSO" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  psos.map(pso => (
                    <TableRow key={pso.id}>
                      <TableCell className='font-medium'>{pso.pso_code}</TableCell>
                      <TableCell className='max-w-md'>{pso.pso_description}</TableCell>
                      <TableCell>
                        <div className='flex gap-2'>
                          <Button size='sm' variant='ghost' className='h-8 w-8 p-0'>
                            <Edit2 className='h-4 w-4' />
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            className='h-8 w-8 p-0 text-red-600 hover:text-red-700'
                            onClick={() => deletePSO(pso.id)}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className='bg-blue-50 border-blue-200'>
        <CardHeader>
          <CardTitle className='text-base'>About POs vs PSOs</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 text-sm text-muted-foreground'>
          <p>
            <strong>Program Outcomes (POs)</strong> are competencies defined by regulatory bodies (AICTE/NBA for engineering). All graduates should achieve these.
          </p>
          <p>
            <strong>Program Specific Outcomes (PSOs)</strong> are additional specialized competencies unique to your program, building on the standard POs.
          </p>
          <p className='text-xs'>
            Next: Link course outcomes to POs and PSOs using the CO-PO Mapping page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
