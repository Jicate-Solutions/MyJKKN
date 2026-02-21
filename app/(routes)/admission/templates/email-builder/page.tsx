'use client';

import { useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  Type, Image, MousePointer, Columns, Minus, Layout, ChevronUp, ChevronDown,
  Trash2, Plus, Eye, Code, Save, Loader2, Mail, Monitor, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { CommunicationTemplatesService } from '@/lib/services/admission/communication-templates-service';

// ============================================================================
// BLOCK TYPES
// ============================================================================

type BlockType = 'header' | 'text' | 'image' | 'button' | 'columns' | 'divider' | 'footer';

interface EmailBlock {
  id: string;
  type: BlockType;
  content: Record<string, string>;
}

const BLOCK_TEMPLATES: Record<BlockType, { label: string; icon: React.ElementType; defaultContent: Record<string, string> }> = {
  header: {
    label: 'Header',
    icon: Layout,
    defaultContent: { text: 'Your Email Title', fontSize: '24', color: '#0b6d41', align: 'center', backgroundColor: '#fbfbee' },
  },
  text: {
    label: 'Text',
    icon: Type,
    defaultContent: { text: 'Your paragraph text goes here. You can use {{variable_name}} for dynamic content.', fontSize: '14', color: '#333333', align: 'left' },
  },
  image: {
    label: 'Image',
    icon: Image,
    defaultContent: { src: '', alt: 'Image', width: '100', align: 'center' },
  },
  button: {
    label: 'Button',
    icon: MousePointer,
    defaultContent: { text: 'Click Here', url: '#', backgroundColor: '#0b6d41', color: '#ffffff', align: 'center', borderRadius: '4' },
  },
  columns: {
    label: 'Columns',
    icon: Columns,
    defaultContent: { leftText: 'Left column content', rightText: 'Right column content' },
  },
  divider: {
    label: 'Divider',
    icon: Minus,
    defaultContent: { color: '#eeeeee', height: '1' },
  },
  footer: {
    label: 'Footer',
    icon: Layout,
    defaultContent: { text: 'JKKN Institutions | Komarapalayam, Tamil Nadu', fontSize: '12', color: '#999999', align: 'center', unsubscribeUrl: '#' },
  },
};

// ============================================================================
// BLOCK RENDERER (HTML)
// ============================================================================

function blockToHtml(block: EmailBlock): string {
  const c = block.content;
  switch (block.type) {
    case 'header':
      return `<div style="background-color:${c.backgroundColor || '#fbfbee'};padding:24px;text-align:${c.align || 'center'}"><h1 style="color:${c.color || '#0b6d41'};font-size:${c.fontSize || '24'}px;margin:0;font-family:Arial,sans-serif">${c.text}</h1></div>`;
    case 'text':
      return `<div style="padding:16px 24px;text-align:${c.align || 'left'}"><p style="color:${c.color || '#333'};font-size:${c.fontSize || '14'}px;line-height:1.6;margin:0;font-family:Arial,sans-serif">${c.text}</p></div>`;
    case 'image':
      return c.src ? `<div style="padding:16px 24px;text-align:${c.align || 'center'}"><img src="${c.src}" alt="${c.alt || ''}" style="max-width:${c.width || '100'}%;height:auto;border:0" /></div>` : '';
    case 'button':
      return `<div style="padding:16px 24px;text-align:${c.align || 'center'}"><a href="${c.url || '#'}" style="display:inline-block;padding:12px 32px;background-color:${c.backgroundColor || '#0b6d41'};color:${c.color || '#fff'};text-decoration:none;border-radius:${c.borderRadius || '4'}px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">${c.text}</a></div>`;
    case 'columns':
      return `<div style="padding:16px 24px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:50%;padding-right:8px;vertical-align:top;font-family:Arial,sans-serif;font-size:14px;color:#333">${c.leftText}</td><td style="width:50%;padding-left:8px;vertical-align:top;font-family:Arial,sans-serif;font-size:14px;color:#333">${c.rightText}</td></tr></table></div>`;
    case 'divider':
      return `<div style="padding:8px 24px"><hr style="border:none;border-top:${c.height || '1'}px solid ${c.color || '#eee'};margin:0" /></div>`;
    case 'footer':
      return `<div style="padding:24px;text-align:${c.align || 'center'};background-color:#f5f5f5"><p style="color:${c.color || '#999'};font-size:${c.fontSize || '12'}px;margin:0;font-family:Arial,sans-serif">${c.text}</p>${c.unsubscribeUrl ? `<p style="margin-top:8px"><a href="${c.unsubscribeUrl}" style="color:#999;font-size:11px">Unsubscribe</a></p>` : ''}</div>`;
    default:
      return '';
  }
}

function blocksToHtml(blocks: EmailBlock[]): string {
  const bodyHtml = blocks.map(blockToHtml).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f0f0f0;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background-color:#ffffff">${bodyHtml}</div></body></html>`;
}

// ============================================================================
// BLOCK EDITOR COMPONENT
// ============================================================================

function BlockEditor({ block, onChange }: { block: EmailBlock; onChange: (content: Record<string, string>) => void }) {
  const update = (key: string, value: string) => onChange({ ...block.content, [key]: value });

  switch (block.type) {
    case 'header':
      return (
        <div className="space-y-3">
          <div><Label>Title Text</Label><Input value={block.content.text} onChange={e => update('text', e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Font Size</Label><Input type="number" value={block.content.fontSize} onChange={e => update('fontSize', e.target.value)} /></div>
            <div><Label>Text Color</Label><Input type="color" value={block.content.color} onChange={e => update('color', e.target.value)} /></div>
            <div><Label>Background</Label><Input type="color" value={block.content.backgroundColor} onChange={e => update('backgroundColor', e.target.value)} /></div>
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="space-y-3">
          <div><Label>Text Content</Label><Textarea rows={4} value={block.content.text} onChange={e => update('text', e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Font Size</Label><Input type="number" value={block.content.fontSize} onChange={e => update('fontSize', e.target.value)} /></div>
            <div><Label>Color</Label><Input type="color" value={block.content.color} onChange={e => update('color', e.target.value)} /></div>
            <div><Label>Align</Label>
              <Select value={block.content.align} onValueChange={v => update('align', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    case 'image':
      return (
        <div className="space-y-3">
          <div><Label>Image URL</Label><Input value={block.content.src} onChange={e => update('src', e.target.value)} placeholder="https://..." /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Alt Text</Label><Input value={block.content.alt} onChange={e => update('alt', e.target.value)} /></div>
            <div><Label>Width %</Label><Input type="number" value={block.content.width} onChange={e => update('width', e.target.value)} /></div>
          </div>
        </div>
      );
    case 'button':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Button Text</Label><Input value={block.content.text} onChange={e => update('text', e.target.value)} /></div>
            <div><Label>URL</Label><Input value={block.content.url} onChange={e => update('url', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>BG Color</Label><Input type="color" value={block.content.backgroundColor} onChange={e => update('backgroundColor', e.target.value)} /></div>
            <div><Label>Text Color</Label><Input type="color" value={block.content.color} onChange={e => update('color', e.target.value)} /></div>
            <div><Label>Radius</Label><Input type="number" value={block.content.borderRadius} onChange={e => update('borderRadius', e.target.value)} /></div>
          </div>
        </div>
      );
    case 'columns':
      return (
        <div className="space-y-3">
          <div><Label>Left Column</Label><Textarea rows={2} value={block.content.leftText} onChange={e => update('leftText', e.target.value)} /></div>
          <div><Label>Right Column</Label><Textarea rows={2} value={block.content.rightText} onChange={e => update('rightText', e.target.value)} /></div>
        </div>
      );
    case 'divider':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Color</Label><Input type="color" value={block.content.color} onChange={e => update('color', e.target.value)} /></div>
          <div><Label>Height (px)</Label><Input type="number" value={block.content.height} onChange={e => update('height', e.target.value)} /></div>
        </div>
      );
    case 'footer':
      return (
        <div className="space-y-3">
          <div><Label>Footer Text</Label><Textarea rows={2} value={block.content.text} onChange={e => update('text', e.target.value)} /></div>
          <div><Label>Unsubscribe URL</Label><Input value={block.content.unsubscribeUrl} onChange={e => update('unsubscribeUrl', e.target.value)} /></div>
        </div>
      );
    default:
      return null;
  }
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

function EmailBuilderPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [templateName, setTemplateName] = useState('');
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    { id: '1', type: 'header', content: BLOCK_TEMPLATES.header.defaultContent },
    { id: '2', type: 'text', content: BLOCK_TEMPLATES.text.defaultContent },
    { id: '3', type: 'button', content: BLOCK_TEMPLATES.button.defaultContent },
    { id: '4', type: 'footer', content: BLOCK_TEMPLATES.footer.defaultContent },
  ]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState('editor');
  const [isSaving, setIsSaving] = useState(false);

  const addBlock = (type: BlockType) => {
    const newBlock: EmailBlock = {
      id: Date.now().toString(),
      type,
      content: { ...BLOCK_TEMPLATES[type].defaultContent },
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === prev.length - 1)) return prev;
      const newBlocks = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
      return newBlocks;
    });
  };

  const updateBlockContent = (id: string, content: Record<string, string>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  };

  const htmlContent = blocksToHtml(blocks);
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!institutionId) {
      toast.error('No institution selected');
      return;
    }

    setIsSaving(true);
    try {
      await CommunicationTemplatesService.createTemplate({
        institution_id: institutionId,
        name: templateName,
        channel: 'email',
        subject: subject || templateName,
        content: htmlContent,
        description: `Email template built with visual editor`,
        variables: [],
        is_active: true,
      });
      toast.success('Template saved successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PermissionGuard module="admission" action="manage">
      <ContentLayout title="Email Builder">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission/templates">Templates</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Email Builder</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Template
            </Button>
          </div>

          {/* Template Name & Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g., Welcome Email" />
            </div>
            <div>
              <Label>Subject Line</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g., Welcome to JKKN Institutions!" />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="editor"><Type className="h-4 w-4 mr-2" />Editor</TabsTrigger>
              <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Preview</TabsTrigger>
              <TabsTrigger value="html"><Code className="h-4 w-4 mr-2" />HTML</TabsTrigger>
            </TabsList>

            <TabsContent value="editor">
              <div className="grid grid-cols-12 gap-6">
                {/* Block Palette */}
                <div className="col-span-2">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Add Block</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 p-2">
                      {(Object.entries(BLOCK_TEMPLATES) as [BlockType, typeof BLOCK_TEMPLATES[BlockType]][]).map(([type, config]) => {
                        const Icon = config.icon;
                        return (
                          <Button
                            key={type}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => addBlock(type)}
                          >
                            <Icon className="h-3.5 w-3.5 mr-2" />{config.label}
                          </Button>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                {/* Block List */}
                <div className="col-span-6">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Email Layout ({blocks.length} blocks)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-3">
                      {blocks.map((block, idx) => {
                        const config = BLOCK_TEMPLATES[block.type];
                        const Icon = config.icon;
                        const isSelected = block.id === selectedBlockId;
                        return (
                          <div
                            key={block.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}
                            onClick={() => setSelectedBlockId(block.id)}
                          >
                            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm flex-1 truncate">{config.label}: {block.content.text || block.content.src || '...'}</span>
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveBlock(block.id, 'up'); }} disabled={idx === 0}>
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveBlock(block.id, 'down'); }} disabled={idx === blocks.length - 1}>
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {blocks.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 text-sm">Add blocks from the palette to start building</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Block Properties */}
                <div className="col-span-4">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">
                        {selectedBlock ? `${BLOCK_TEMPLATES[selectedBlock.type].label} Properties` : 'Select a block'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      {selectedBlock ? (
                        <BlockEditor block={selectedBlock} onChange={content => updateBlockContent(selectedBlock.id, content)} />
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Click on a block to edit its properties</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm">Preview</CardTitle>
                  <div className="flex gap-1">
                    <Button variant={previewMode === 'desktop' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewMode('desktop')}>
                      <Monitor className="h-4 w-4 mr-1" />Desktop
                    </Button>
                    <Button variant={previewMode === 'mobile' ? 'default' : 'outline'} size="sm" onClick={() => setPreviewMode('mobile')}>
                      <Smartphone className="h-4 w-4 mr-1" />Mobile
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex justify-center p-6 bg-muted/30">
                  <div style={{ width: previewMode === 'mobile' ? '375px' : '600px' }} className="bg-white shadow-lg rounded overflow-hidden">
                    <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="html">
              <Card>
                <CardContent className="p-4">
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                    {htmlContent}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function EmailBuilderPage() {
  return (
    <AdmissionErrorBoundary>
      <EmailBuilderPageContent />
    </AdmissionErrorBoundary>
  );
}
