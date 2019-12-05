/* import { component } from '../src/api'
import { array, number, object, string } from 'crafter'
import { addAcceptor, getAcceptorFactory } from '../src/lib/helpers'

const User = component(
  object({
    id: string(),
    name: string(),
  })
)
  .addAcceptor('setName', model => ({
    mutator({ name }: { name: string }) {
      model.name = name
    },
  }))
  .addActions({
    setName: 'setName',
  })

const Location = component(
  object({
    type: string(),
    coordinates: array(number()),
  })
)
  .addAcceptor('setCoordinates', model => ({
    mutator(coordinates: typeof model['coordinates']) {
      model.coordinates = coordinates
    },
  }))
  .addActions({
    move: 'setCoordinates',
  })

const Inventory = component(
  array(
    object({
      itemId: string(),
      quantity: number(),
    })
  )
)
  .addAcceptor('upsert', model => ({
    mutator(item: { itemId: string; quantity: number }) {
      const slot = model.find(slot => slot.itemId === item.itemId)
      if (slot) {
        slot.quantity += item.quantity
      } else {
        model.push(item)
      }
    },
  }))
  .addAcceptor('remove', model => ({
    mutator({ itemId }: { itemId: string }) {
      const slot = model.find(slot => slot.itemId === itemId)
      if (slot) {
        slot.quantity--
      }
    },
  }))
  .addActions({
    add: 'upsert',
    addMultiple(items: Array<{ itemId: string; quantity: number }>) {
      return items.map(item => ({
        type: 'upsert',
        payload: { ...item },
      }))
    },
  })

const Stats = component(
  object({
    force: number(),
    health: number(),
  })
)
  .addAcceptor('setForce', model => ({
    mutator({ value }: { value: number }) {
      model.force = value
    },
  }))
  .addAcceptor('setHealth', model => ({
    mutator({ value }: { value: number }) {
      model.health = value
    },
  }))
  .addActions({
    setForce: 'setForce',
    setHealth: 'setHealth',
  })

type QuestStatus = {
  id: string
  todoObjectiveIds: string[]
  inProgressObjectiveIds: string[]
  completeObjectiveIds: string[]
}

const hasQuest = (status: QuestStatus[]) => (questId: string) =>
  status.some(({ id }) => id === questId)

const QuestLog = component(
  object({
    currentQuests: array(
      object({
        id: string(),
        todoObjectiveIds: array(string()),
        inProgressObjectiveIds: array(string()),
        completeObjectiveIds: array(string()),
      })
    ),
  })
)
  .addAcceptor('addQuest', model => ({
    condition({ questStatus }: { questStatus: QuestStatus }) {
      return hasQuest(model.currentQuests)(questStatus.id)
    },
    mutator({ questStatus }: { questStatus: QuestStatus }) {
      model.currentQuests.push(questStatus)
    },
  }))
  .addAcceptor('removeQuest', model => ({
    condition({ questStatus }: { questStatus: QuestStatus }) {
      return hasQuest(model.currentQuests)(questStatus.id)
    },
    mutator({ questId }: { questId: string }) {
      model.currentQuests.splice(
        model.currentQuests.findIndex(({ id }) => id === questId),
        1
      )
    },
  }))
  .addAcceptor('addTodoObjectiveIds', model => ({
    condition({ questStatus }: { questStatus: QuestStatus }) {
      return hasQuest(model.currentQuests)(questStatus.id)
    },
    mutator({ questId, todoId }: { questId: string; todoId: string }) {
      model.currentQuests
        .find(({ id }) => questId === id)
        ?.todoObjectiveIds.push(todoId)
    },
  }))
  .addAcceptor('removeTodoObjectiveIds', model => ({
    condition({ questStatus }: { questStatus: QuestStatus }) {
      return hasQuest(model.currentQuests)(questStatus.id)
    },
    mutator({
      questId,
      objectiveId,
    }: {
      questId: string
      objectiveId: string
    }) {
      const todoObjectiveIds = model.currentQuests.find(
        ({ id }) => id === questId
      )?.todoObjectiveIds
      if (todoObjectiveIds) {
        const index = todoObjectiveIds.indexOf(objectiveId)
        todoObjectiveIds.splice(index, 1)
      }
    },
  }))
  .addAcceptor('addInProgressObjectiveIds', model => ({
    mutator({
      questId,
      objectiveId,
    }: {
      questId: string
      objectiveId: string
    }) {
      model.currentQuests
        .find(({ id }) => questId === id)
        ?.inProgressObjectiveIds.push(objectiveId)
    },
  }))
  .addAcceptor('removeInProgressObjectiveIds', model => ({
    mutator({
      questId,
      objectiveId,
    }: {
      questId: string
      objectiveId: string
    }) {
      const inProgressObjectiveIds = model.currentQuests.find(
        ({ id }) => id === questId
      )?.inProgressObjectiveIds
      if (inProgressObjectiveIds) {
        const index = inProgressObjectiveIds.indexOf(objectiveId)
        inProgressObjectiveIds.splice(index, 1)
      }
    },
  }))
  .addAcceptor('addCompleteObjectiveIdst', model => ({
    mutator({
      questId,
      completeObjectiveId,
    }: {
      questId: string
      completeObjectiveId: string
    }) {
      model.currentQuests
        .find(({ id }) => questId === id)
        ?.completeObjectiveIds.push(completeObjectiveId)
    },
  }))
  .addAcceptor('removeCompleteObjectiveIds', model => ({
    mutator({
      questId,
      objectiveId,
    }: {
      questId: string
      objectiveId: string
    }) {
      const completeObjectiveIds = model.currentQuests.find(
        ({ id }) => id === questId
      )?.completeObjectiveIds
      if (completeObjectiveIds) {
        const index = completeObjectiveIds.indexOf(objectiveId)
        completeObjectiveIds.splice(index, 1)
      }
    },
  }))
/* .addAsyncAction({
  acceptQuest(questId: string) {
    return new Promise(resolve => {
      DataService
        .getQuest(questId)
        .then(quest => resolve([{
          type: "addQuest",
          payload: createQuestStatus(quest)
        }]))
        .catch(() => resolve([]))
    })
  }
}) */

test.todo('')
/* const Player = compose(
  User,
  object({
    questsLog: QuestLog,
    stats: Stats,
    inventory: Inventory,
    location: Location
  })
)

const World = component(
  array(Player)
).setAcceptors(model => ({
  setUniqueName: {
    condition(payload: {id: string, name: string}) { return !model.some(player => player.name === payload.name)},
    mutator(payload: {id: string, name: string}) { 
      const player = model.find(p => p.id === payload.id)
      if (player) {
        player.name = payload.name
      }
    }
  }
}))
.addAction({
  setUniqueName(id: string, name: string) {
    return [{
      type: "setUniqueName",
      payload: {
        id,
        name: sanitize(name) // avoid code injection
      }
   }]
  }
})
.addReaction((model, intents, mutations, controleState, patch) => doSomething) */
/*
const Fraktar = Player.create({
  name: "Fraktar",
  stats: {
    force: 10,
    health: 10
  },
  inventory: [{ itemId: "sword", quantity: 1 }],
  location: {
    type: "Point",
    coordinates: [2, 47]
  }
});

const actions = Fraktar.acti

const uiStore = Fraktar.representation;

type Props = {
  uiStore: typeof Player["representation"];
};

const component = inject("uiStore")(
  observe(function(props: Props) {
    const name = document.createElement("div");
    name.appendChild(props.uiStore.name);
    return name;
  })
);
 */