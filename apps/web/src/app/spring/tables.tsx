import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from 'react95';
import styled from 'styled-components';

/** The Win95 table with a couple of column helpers shared by the lists. */

const Scroll = styled.div`
  overflow-x: auto;
`;

export const Num = styled(TableDataCell)`
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

export const Cell = TableDataCell;

export const ActionCell = styled(TableDataCell)`
  text-align: right;
  white-space: nowrap;

  & > * + * {
    margin-left: 4px;
  }
`;

export function DataTable({
  columns,
  children,
}: {
  columns: { label: ReactNode; numeric?: boolean; hidden?: boolean }[];
  children: ReactNode;
}) {
  return (
    <Scroll>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((column, i) => (
              <TableHeadCell
                key={i}
                style={column.numeric ? { textAlign: 'right' } : undefined}
              >
                {column.hidden ? (
                  <span className="visually-hidden">{column.label}</span>
                ) : (
                  column.label
                )}
              </TableHeadCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </Scroll>
  );
}

export { TableRow };
