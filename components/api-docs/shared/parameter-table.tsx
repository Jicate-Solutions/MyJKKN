import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiParameter, ParameterType } from '@/lib/types/api-documentation';

interface ParameterTableProps {
  parameters: ApiParameter[];
  title?: string;
  type: ParameterType;
  showExamples?: boolean;
}

export function ParameterTable({
  parameters,
  title,
  type,
  showExamples = true,
}: ParameterTableProps) {
  if (parameters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {title && <h4 className="text-sm font-semibold text-foreground">{title}</h4>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[80px]">Required</TableHead>
              <TableHead>Description</TableHead>
              {showExamples && <TableHead className="w-[150px]">Example</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {parameters.map((param, index) => (
              <TableRow key={index}>
                <TableCell className="font-mono text-sm font-medium">
                  {param.name}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {param.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {param.required ? (
                    <Badge variant="destructive" className="text-xs">
                      Required
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Optional
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {param.description}
                  {param.default !== undefined && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium">Default:</span>{' '}
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        {String(param.default)}
                      </code>
                    </div>
                  )}
                  {param.enum && param.enum.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium">Values:</span>{' '}
                      {param.enum.map((val, i) => (
                        <code
                          key={i}
                          className="ml-1 rounded bg-muted px-1.5 py-0.5"
                        >
                          {val}
                        </code>
                      ))}
                    </div>
                  )}
                  {param.min !== undefined && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium">Min:</span> {param.min}
                    </div>
                  )}
                  {param.max !== undefined && (
                    <div className="mt-1 text-xs">
                      <span className="font-medium">Max:</span> {param.max}
                    </div>
                  )}
                </TableCell>
                {showExamples && (
                  <TableCell>
                    {param.example !== undefined && (
                      <code className="text-xs rounded bg-muted px-2 py-1">
                        {String(param.example)}
                      </code>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
