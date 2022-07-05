[warfog.ravioli](../README.md) / IContainerFactory

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

### Methods

- [addAcceptor](IContainerFactory.md#addacceptor)
- [addActions](IContainerFactory.md#addactions)
- [addControlStatePredicate](IContainerFactory.md#addcontrolstatepredicate)
- [addStepReaction](IContainerFactory.md#addstepreaction)
- [addTransformation](IContainerFactory.md#addtransformation)
- [create](IContainerFactory.md#create)

## Methods

### addAcceptor

▸ **addAcceptor**<`N`, `M`\>(`name`, `acceptor`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `Exclude`<`MUTATIONS`, { `payload`: `never` ; `type`: `never`  }\> \| `Exclude`<{ `payload`: `Parameters`<`M`[``"mutator"``]\>[``1``] ; `type`: `N`  }, { `payload`: `never` ; `type`: `never`  }\>, `never`, `never`, `TYPE`\>

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

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `Exclude`<`MUTATIONS`, { `payload`: `never` ; `type`: `never`  }\> \| `Exclude`<{ `payload`: `Parameters`<`M`[``"mutator"``]\>[``1``] ; `type`: `N`  }, { `payload`: `never` ; `type`: `never`  }\>, `never`, `never`, `TYPE`\>

___

### addActions

▸ **addActions**<`P`\>(`actions`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS` \| `Actions`<`CONTROL_STATES`, `MUTATIONS`, `P`\>, `TYPE`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `P` | extends `PackagedActions`<`CONTROL_STATES`, `MUTATIONS`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `actions` | `P` |

#### Returns

[`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS` \| `Actions`<`CONTROL_STATES`, `MUTATIONS`, `P`\>, `TYPE`\>

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

### addStepReaction

▸ **addStepReaction**<`I`, `R`\>(`name`, `reaction`): [`IContainerFactory`](IContainerFactory.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `I` | extends `string` |
| `R` | extends `StepReaction`<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `name` | `I` |
| `reaction` | `R` |

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

▸ **create**(`initialValue`): [`IInstance`](IInstance.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `initialValue` | `TYPE` |

#### Returns

[`IInstance`](IInstance.md)<`TYPE`, `MUTATIONS`, `CONTROL_STATES`, `ACTIONS`, `REPRESENTATION`\>
