# Crafter
A reactive librairy powered by JSON patch and SAM Pattern.

## Data mutability/immutability
Each node has two type of data: a snapshot and the instance value.
- The value acts has a mutable data structure, like vanilla JS object. It the node data changes, all the consumers will be kept up to date.
- The snapshot acts has an immutable data structure. It the node data changes, the previous consumer will ketps the old value, but the new consumer will get a fresh value.

Note that recomputation of the value/snapshot is very cheap thanks to memoization.

## Step hooks

### onStepStart()
executed at the begining of the SAM cyvle, before the mutations.

### onModelDidUpdate()
executed just after the mutations, before the changes propagations.

### onModelWillRollback()
executed when the model has thrown during mutations. Just before rolling back to the previous state.

### onModelDidRollback()
executed when the model has thrown during mutations. Just after the roll back.

### onStepWillEnd()
executed at the end of the SAM cycle. Before container cleaning.
