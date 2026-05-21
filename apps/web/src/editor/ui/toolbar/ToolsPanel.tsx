import type { ShapeKind } from '../../layers/ShapeLayer';
import type { ReactNode } from 'react';
import { cn } from '../classNames';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

export type ToolDefinition = {
  description: string;
  icon: string | ReactNode;
  label: string;
  status?: 'available' | 'later';
  value: string;
};

type ToolsPanelProps = {
  canEditDocument: boolean;
  onSelectTool: (tool: string) => void;
  onSelectShape: (shape: ShapeKind) => void;
  selectedShape: ShapeKind;
  selectedTool: string;
  tools: ToolDefinition[];
};

export function ToolsPanel({
  canEditDocument,
  onSelectShape,
  onSelectTool,
  selectedShape,
  selectedTool,
  tools,
}: ToolsPanelProps) {
  const availableTools = tools.filter((tool) => tool.status !== 'later');
  const laterTools = tools.filter((tool) => tool.status === 'later');

  return (
    <aside
      className='min-h-0 overflow-auto bg-[#17191d] px-1 py-3 opacity-100 transition-[opacity,padding,transform] duration-[220ms] ease-in-out [.has-no-document_&]:pointer-events-none [.has-no-document_&]:-translate-x-2.5 [.has-no-document_&]:px-0 [.has-no-document_&]:opacity-0 border-r border-[#2a2d31]'
      aria-label='Left tools panel'
    >
      <ToolGroup
        onSelectShape={onSelectShape}
        onSelectTool={onSelectTool}
        canEditDocument={canEditDocument}
        selectedShape={selectedShape}
        selectedTool={selectedTool}
        tools={availableTools}
      />
      {laterTools.length > 0 ? (
        <>
          <p className='m-0 mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-normal text-[#737b86]'>
            Later
          </p>
          <ToolGroup
            onSelectShape={onSelectShape}
            onSelectTool={onSelectTool}
            canEditDocument={canEditDocument}
            selectedShape={selectedShape}
            selectedTool={selectedTool}
            tools={laterTools}
          />
        </>
      ) : null}
    </aside>
  );
}

function ToolGroup({
  onSelectTool,
  onSelectShape,
  canEditDocument,
  selectedShape,
  selectedTool,
  tools,
}: {
  onSelectTool: (tool: string) => void;
  onSelectShape: (shape: ShapeKind) => void;
  canEditDocument: boolean;
  selectedShape: ShapeKind;
  selectedTool: string;
  tools: ToolDefinition[];
}) {
  return (
    <div className='grid place-items-center'>
      {tools.map((tool) => {
        const isDisabled =
          tool.status === 'later' || (!canEditDocument && tool.value !== 'Pan');

        return (
          <div className='grid gap-1.5' key={tool.value}>
            <Tooltip>
              <TooltipTrigger className='w-full'>
                <button
                  aria-pressed={tool.value === selectedTool}
                  title={tool.label}
                  className={cn(
                    'group flex items-center justify-center gap-3 rounded-lg border border-transparent bg-transparent text-center text-[11px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] cursor-pointer',
                    tool.value === selectedTool &&
                      'border-[#4aa391] bg-[#172722] text-[#dff7f1]',
                    isDisabled &&
                      'cursor-not-allowed text-[#737b86] opacity-70',
                  )}
                  disabled={isDisabled}
                  onClick={() => onSelectTool(tool.value)}
                  type='button'
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-md text-sm font-extrabold text-[#e8f4f1]',
                      tool.value === selectedTool &&
                        'border-[#5bb7a4] bg-[#25453e]',
                    )}
                    aria-hidden='true'
                  >
                    {typeof tool.icon === 'string' &&
                    tool.icon.endsWith('.svg') ? (
                      <img
                        src={tool.icon}
                        alt={tool.label}
                        className='h-6 w-6'
                      />
                    ) : (
                      tool.icon
                    )}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tool.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

function toShapeKind(value: string): ShapeKind {
  if (
    value === 'circle' ||
    value === 'line' ||
    value === 'triangle' ||
    value === 'diamond' ||
    value === 'arrow' ||
    value === 'custom'
  ) {
    return value;
  }

  return 'rectangle';
}
