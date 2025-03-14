[@warfog/ravioli](../README.md) / IContainerFactory

# Interface: IContainerFactory<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `TYPE` | `TYPE` |
| `MUTATIONS` | extends `Mutation`<`any`, `any`\> = { `payload`: `never` ; `type`: `never`  } |
| `CONTROL_STATES` | extends `string` = `never` |
| `ACTIONS` | `never` |
| `REPRESENTATION` | `TYPE` |

## Table of contents

### Properties

- [Mutations](IContainerFactory.md#mutations)

### Methods

- [addAcceptor](IContainerFactory.md#addacceptor)
- [addActions](IContainerFactory.md#addactions)
- [addControlStatePredicate](IContainerFactory.md#addcontrolstatepredicate)
- [addStaticTransformation](IContainerFactory.md#addstatictransformation)
- [addStepReaction](IContainerFactory.md#addstepreaction)
- [addTransformation](IContainerFactory.md#addtransformation)
- [create](IContainerFactory.md#create)

## Properties

### Mutations

• **Mutations**: `MUTATIONS`

For typing only.

**`Throws`**

Don't try to access this property.

#### Defined in

[index.ts:96](https://github.com/dagatsoin/ravioli/blob/ccd7938/src/api/index.ts#L96)

## Methods

### addAcceptor

▸ **addAcceptor**<`N`, `M`\>(`name`, `acceptor`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `Exclude`<`MUTATIONS`, { `payload`: `never` ; `type`: `never`  }\> \| `Exclude`<{ `payload`: `Parameters`<`M`[``"mutator"``]\>[``1``] ; `type`: `N`  }, { `payload`: `never` ; `type`: `never`  }\>, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `N` | extends `string` |
| `M` | extends `Acceptor`<`TYPE`, `any`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `name` | `N` |
| `acceptor` | `M` |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `Exclude`<`MUTATIONS`, { `payload`: `never` ; `type`: `never`  }\> \| `Exclude`<{ `payload`: `Parameters`<`M`[``"mutator"``]\>[``1``] ; `type`: `N`  }, { `payload`: `never` ; `type`: `never`  }\>, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

___

### addActions

▸ **addActions**<`P`\>(`actions`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS` \| `Actions`<`CONTROL_STATES`, `MUTATIONS`, `P`\>, `REPRESENTATION`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `P` | extends `PackagedActions`<`CONTROL_STATES`, `MUTATIONS`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `actions` | `P` |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS` \| `Actions`<`CONTROL_STATES`, `MUTATIONS`, `P`\>, `REPRESENTATION`\>

___

### addControlStatePredicate

▸ **addControlStatePredicate**<`I`\>(`id`, `predicate`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES` \| `I`, `never`, `TYPE`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `I` | extends `string` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `id` | `I` |
| `predicate` | `CSPredicate`<`TYPE`, `MUTATIONS`, `CONTROL_STATES` \| `I`\> |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES` \| `I`, `never`, `TYPE`\>

___

### addStaticTransformation

▸ **addStaticTransformation**<`C`\>(`transformer`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `ReturnType`<`C`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `C` | extends `StaticTransformation`<`TYPE`, `ACTIONS`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `transformer` | `C` |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `ReturnType`<`C`\>\>

___

### addStepReaction

▸ **addStepReaction**<`I`, `R`\>(`args`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `I` | extends `string` |
| `R` | extends `StepReaction`<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `StepReaction`<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\> |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

___

### addTransformation

▸ **addTransformation**<`C`\>(`transformer`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `ReturnType`<`C`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `C` | extends `Transformation`<`TYPE`, `CONTROL_STATES`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `transformer` | `C` |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `ReturnType`<`C`\>\>

___

### create

▸ **create**(`initialValue`, `options?`): [`IInstance`](IInstance.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `initialValue` | `TYPE` |
| `options?` | `ContainerOption` |

#### Returns

[`IInstance`](IInstance.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>
