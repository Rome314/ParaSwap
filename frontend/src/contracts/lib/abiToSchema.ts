import type {
  ContractSchema,
  ContractFunction,
  FunctionParameter,
  RenderFormSchema,
  FormFieldType,
  FieldType,
} from '@openzeppelin/ui-types';
import type { AbiFunction, AbiParam } from './abis';

// ─── Type mapping ─────────────────────────────────────────────────────────────

function solidityToFieldType(solidityType: string): FieldType {
  if (solidityType === 'address') return 'blockchain-address';
  if (solidityType === 'bool') return 'checkbox';
  if (solidityType === 'string') return 'text';
  if (solidityType === 'bytes' || /^bytes\d+$/.test(solidityType)) return 'bytes';
  if (/^(u?int)(8|16|24|32|40|48)$/.test(solidityType)) return 'number';
  if (/^u?int/.test(solidityType)) return 'bigint';
  if (solidityType === 'tuple') return 'object';
  if (solidityType.endsWith('[]') || solidityType.endsWith(']')) return 'array';
  return 'text';
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function toLabel(name: string): string {
  if (!name || name === '_') return 'Value';
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ─── ABI param → FunctionParameter ───────────────────────────────────────────

function paramToFunctionParameter(param: AbiParam): FunctionParameter {
  return {
    name: param.name || '_',
    type: param.type,
    ...(param.components
      ? { components: param.components.map(paramToFunctionParameter) }
      : {}),
  };
}

// ─── ABI function → ContractFunction ─────────────────────────────────────────

function abiFnToContractFunction(fn: AbiFunction): ContractFunction {
  const inputSig = fn.inputs.map((i) => i.type).join(',');
  const id = inputSig ? `${fn.name}-${inputSig}` : fn.name;
  const modifiesState =
    fn.stateMutability !== 'view' && fn.stateMutability !== 'pure';

  return {
    id,
    name: fn.name,
    displayName: toLabel(fn.name),
    type: 'function',
    stateMutability: fn.stateMutability,
    modifiesState,
    inputs: fn.inputs.map(paramToFunctionParameter),
    outputs: fn.outputs?.map(paramToFunctionParameter) ?? [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a JSON ABI array to an OZ ContractSchema.
 * Used for both ContractStateWidget (view fns) and TransactionForm (write fns).
 */
export function abiToContractSchema(name: string, abi: AbiFunction[]): ContractSchema {
  return {
    name,
    ecosystem: 'evm',
    functions: abi.filter((x) => x.type === 'function').map(abiFnToContractFunction),
    metadata: {},
  };
}

/**
 * Build an OZ RenderFormSchema for a single write function.
 * Used as the `schema` prop of <TransactionForm>.
 */
export function writeFnToRenderFormSchema(fn: AbiFunction): RenderFormSchema {
  const inputSig = fn.inputs.map((i) => i.type).join(',');
  const id = inputSig ? `${fn.name}-${inputSig}` : fn.name;

  const fields: FormFieldType[] = fn.inputs.map((input, i) => {
    const fieldId = input.name || `param${i}`;
    return {
      id: fieldId,
      name: fieldId,
      label: toLabel(input.name || `Param ${i + 1}`),
      type: solidityToFieldType(input.type),
      placeholder: input.type,
    } as FormFieldType;
  });

  const isPayable = fn.stateMutability === 'payable';

  return {
    id,
    title: toLabel(fn.name),
    description: isPayable ? 'This function accepts ETH.' : undefined,
    fields,
    contractAddress: '',
    validation: { mode: 'onChange' as const, showErrors: 'inline' as const },
    layout: { columns: 1, spacing: 'normal' as const, labelPosition: 'top' as const },
    submitButton: {
      text: toLabel(fn.name),
      loadingText: `${toLabel(fn.name)}…`,
    },
  };
}

/**
 * Filter an ABI to only write functions (nonpayable + payable).
 */
export function getWriteFunctions(abi: AbiFunction[]): AbiFunction[] {
  return abi.filter(
    (fn) =>
      fn.type === 'function' &&
      (fn.stateMutability === 'nonpayable' || fn.stateMutability === 'payable'),
  );
}

/**
 * Filter an ABI to only view/pure functions.
 */
export function getReadFunctions(abi: AbiFunction[]): AbiFunction[] {
  return abi.filter(
    (fn) =>
      fn.type === 'function' &&
      (fn.stateMutability === 'view' || fn.stateMutability === 'pure'),
  );
}
