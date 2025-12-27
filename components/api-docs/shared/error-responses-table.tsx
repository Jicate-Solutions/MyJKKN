'use client';

import { Fragment, useState } from 'react';
import { ApiErrorResponse } from '@/lib/types/api-documentation';
import { StatusBadge } from './status-badge';
import { CodeBlock } from './code-block';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ErrorResponsesTableProps {
  errors: ApiErrorResponse[];
  showCommonErrors?: boolean;
  commonErrors?: ApiErrorResponse[];
}

export function ErrorResponsesTable({
  errors,
  showCommonErrors = false,
  commonErrors = [],
}: ErrorResponsesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const allErrors = showCommonErrors
    ? [...errors, ...commonErrors]
    : errors;

  if (allErrors.length === 0) {
    return null;
  }

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Error Responses</h4>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[200px]">Error Code</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allErrors.map((error, index) => {
              const isExpanded = expandedRows.has(index);
              const isCommon = showCommonErrors && index >= errors.length;

              return (
                <Fragment key={index}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(index)}
                  >
                    <TableCell>
                      <div className="flex items-center justify-center w-full">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge statusCode={error.statusCode} size="sm" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                          {error.errorCode}
                        </code>
                        {isCommon && (
                          <Badge variant="outline" className="text-xs">
                            Common
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {error.message}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/20 p-4">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            Example Response
                          </div>
                          <CodeBlock
                            code={JSON.stringify(error.example, null, 2)}
                            language="json"
                            maxHeight="200px"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
