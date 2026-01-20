import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Award, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecordsListProps {
  learnerId: string;
}

export default function RecordsList({ learnerId }: RecordsListProps) {
  // TODO: Fetch actual records from database/service

  const placeholderRecords = [
    {
      id: '1',
      type: 'transcript',
      title: 'Academic Transcript',
      description: 'Complete record of courses and grades',
      icon: FileText,
    },
    {
      id: '2',
      type: 'certificate',
      title: 'Certificates',
      description: 'Course completion certificates',
      icon: Award,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {placeholderRecords.map((record) => {
        const Icon = record.icon;
        return (
          <Card key={record.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Icon className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-lg">{record.title}</CardTitle>
                  <CardDescription>{record.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Coming soon
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
