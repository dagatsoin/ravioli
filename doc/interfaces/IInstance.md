[@warfog/ravioli](../README.md) / IInstance

# Interface: IInstance<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS, REPRESENTATION\>

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

- [actions](IInstance.md#actions)
- [controlStates](IInstance.md#controlstates)
- [representationRef](IInstance.md#representationref)
- [stepId](IInstance.md#stepid)

### Methods

- [compose](IInstance.md#compose)

## Properties

### actions

• **actions**: `ACTIONS`

The available action for the next step.

#### Defined in

[index.ts:123](https://github.com/dagatsoin/ravioli/blob/5882dc3/src/api/index.ts#L123)

___

### controlStates

• **controlStates**: `CONTROL_STATES`[]

The current control states ofr the given step. It is a Mobx reactive array.

#### Defined in

[index.ts:113](https://github.com/dagatsoin/ravioli/blob/5882dc3/src/api/index.ts#L113)

___

### representationRef

• **representationRef**: `Object`

The current representation synchronised with the model.
It is a reactive object and you can use it in any MobX based
front end.

#### Type declaration

| Name | Type |
| :------ | :------ |
| `current` | `REPRESENTATION` |

#### Defined in

[index.ts:119](https://github.com/dagatsoin/ravioli/blob/5882dc3/src/api/index.ts#L119)

___

### stepId

• **stepId**: `number`

The current step nonce.

#### Defined in

[index.ts:127](https://github.com/dagatsoin/ravioli/blob/5882dc3/src/api/index.ts#L127)

## Methods

### compose

▸ **compose**(`composer`): `void`

Compose multiple actions in one proposal.
The first argument of the composer callback is the current available actions.
The given callback should return an array of proposal.

#### Parameters

| Name | Type |
| :------ | :------ |
| `composer` | `ActionComposer`<`ACTIONS`, `MUTATIONS`\> |

#### Returns

`void`
