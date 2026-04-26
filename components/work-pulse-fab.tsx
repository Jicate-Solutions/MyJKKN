'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WP_CATEGORIES, SubmitWeeklyPulseDto } from '@/types/work-pulse';
import { quickSubmitPulse } from '@/app/(routes)/work-pulse/_actions/pulse-actions';

const quickSchema = z.object({
  talent_waste_category: z.string().min(1, 'Select a category'),
  talent_waste_description: z.string().min(10, 'At least 10 characters'),
  repetition_category: z.string().min(1, 'Select a category'),
  repetition_description: z.string().min(10, 'At least 10 characters'),
});

type QuickFormValues = z.infer<typeof quickSchema>;

export function WorkPulseFab() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<QuickFormValues>({
    resolver: zodResolver(quickSchema),
    defaultValues: {
      talent_waste_category: '',
      talent_waste_description: '',
      repetition_category: '',
      repetition_description: '',
    },
  });

  // Hide on work-pulse pages — AFTER all hooks
  if (pathname.startsWith('/work-pulse')) return null;

  async function onSubmit(values: QuickFormValues) {
    setSubmitting(true);
    try {
      const result = await quickSubmitPulse(values as SubmitWeeklyPulseDto);
      if (result.success) {
        toast.success('Pulse submitted!');
        setIsOpen(false);
        form.reset();
      } else {
        toast.error(result.error || 'Failed to submit');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Modal — fixed position, anchored to bottom-right */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-4 bottom-4 z-[200]"
          >
            <Card className="w-80 shadow-2xl border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Quick Pulse
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  {/* Q1 */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">What could a junior staff or computer have done this week?</p>
                    <Select
                      onValueChange={(val) => form.setValue('talent_waste_category', val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Category..." />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="top"
                        className="z-[300] max-h-[200px]"
                        sideOffset={4}
                      >
                        {WP_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs">
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="e.g. 4 hours copying attendance into Excel"
                      {...form.register('talent_waste_description')}
                      className="min-h-[50px] text-xs"
                    />
                  </div>

                  {/* Q2 */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Most repetitive task that should be automated?</p>
                    <Select
                      onValueChange={(val) => form.setValue('repetition_category', val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Category..." />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="top"
                        className="z-[300] max-h-[200px]"
                        sideOffset={4}
                      >
                        {WP_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs">
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="e.g. Manually checking 80 fee payments every Monday"
                      {...form.register('repetition_description')}
                      className="min-h-[50px] text-xs"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    Submit Pulse
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button — disappears when modal is open */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed right-4 bottom-20 z-[100]"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="rounded-full h-12 w-12 p-0 shadow-lg bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              <Zap className="h-5 w-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
