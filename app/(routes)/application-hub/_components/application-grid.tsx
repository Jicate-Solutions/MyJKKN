'use client';

import { Application } from '@/types/applications';
import { ApplicationCard } from './application-card';
import { useEffect, useState } from 'react';
import { ApplicationGridSkeleton } from './application-grid-skeleton';
import { motion, AnimatePresence  } from "framer-motion"

interface ApplicationGridProps {
  applications: Application[];
  loading?: boolean;
}

export function ApplicationGrid({ applications, loading  }: ApplicationGridProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);
  
    if (!mounted) return null;
    
    if (loading) {
      return <ApplicationGridSkeleton />;
    }

    if (applications.length === 0) {
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12"
          >
            <p className="text-lg font-medium">No applications found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </motion.div>
        );
      }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <AnimatePresence mode="popLayout">
      {applications.map((application) => (
        <motion.div
          key={application.id}
          layout
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          <ApplicationCard application={application} />
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
  );
}