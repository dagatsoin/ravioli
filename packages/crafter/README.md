# Crafter
A reactive librairy powered by JSON patch and SAM Pattern.

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
