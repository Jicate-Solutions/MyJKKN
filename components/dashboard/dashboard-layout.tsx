'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings, Save, X, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardWidget {
  id: string;
  widget_type_id: string;
  position: number;
  column_span: number;
  row_span: number;
  settings?: Record<string, unknown>;
  widget_type?: {
    widget_name: string;
    description: string;
    category: string;
  };
}

interface DashboardConfiguration {
  id: string;
  configuration_name: string;
  is_default: boolean;
  widgets?: DashboardWidget[];
}

interface DashboardLayoutProps {
  configuration: DashboardConfiguration | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onAddWidget: () => void;
}

export function DashboardLayout({
  configuration,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onAddWidget
}: DashboardLayoutProps) {
  const widgets = configuration?.widgets || [];

  if (!configuration) {
    return (
      <Card className="p-8 text-center">
        <CardContent>
          <p className="text-muted-foreground mb-4">No dashboard configuration found</p>
          <Button onClick={onAddWidget}>
            <Plus className="h-4 w-4 mr-2" />
            Create Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Edit Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{configuration.configuration_name}</Badge>
          {configuration.is_default && (
            <Badge variant="secondary">Default</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={onSave}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence mode="popLayout">
          {widgets.map((widget, index) => (
            <motion.div
              key={widget.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              style={{
                gridColumn: `span ${Math.min(widget.column_span || 1, 4)}`,
                gridRow: `span ${widget.row_span || 1}`
              }}
            >
              <Card className={`h-full ${isEditing ? 'ring-2 ring-primary/20 cursor-move' : ''}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {widget.widget_type?.widget_name || 'Widget'}
                  </CardTitle>
                  {isEditing && (
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {widget.widget_type?.description || 'Dashboard widget'}
                  </p>
                  {widget.widget_type?.category && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      {widget.widget_type.category}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add Widget Button */}
        {isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card
              className="h-full min-h-[200px] border-dashed cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-center"
              onClick={onAddWidget}
            >
              <CardContent className="text-center">
                <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Add Widget</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Empty State */}
      {widgets.length === 0 && !isEditing && (
        <Card className="p-12 text-center">
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Your dashboard is empty. Add widgets to get started.
            </p>
            <Button onClick={onEdit}>
              <Settings className="h-4 w-4 mr-2" />
              Customize Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
