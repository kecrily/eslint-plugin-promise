function isFunctionWithBlockStatement (node) {
  if (node.type === 'FunctionExpression') {
    return true
  }
  if (node.type === 'ArrowFunctionExpression') {
    return node.body.type === 'BlockStatement'
  }
  return false
}

function isThenCallExpression (node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === 'then'
  )
}

function isFirstArgument (node) {
  return (
    node.parent &&
    node.parent.arguments &&
    node.parent.arguments[0] === node
  )
}

function isInlineThenFunctionExpression (node) {
  return (
    isFunctionWithBlockStatement(node) &&
    isThenCallExpression(node.parent) &&
    isFirstArgument(node)
  )
}

function peek (arr) {
  return arr[arr.length - 1]
}

module.exports = {
  create: function (context) {
    // funcInfoStack is a stack representing the stack of currently executing
    //   functions
    // funcInfoStack[i].branchIDStack is a stack representing the currently
    //   executing branches ("codePathSegment"s) within the given function
    // funcInfoStack[i].branchInfoMap is an object representing information
    //   about all branches within the given function
    // funcInfoStack[i].branchInfoMap[j].good is a boolean representing whether
    //   the given branch explictly `return`s or `throw`s. It starts as `false`
    //   for every branch and is updated to `true` if a `return` or `throw`
    //   statement is found
    // funcInfoStack[i].branchInfoMap[j].loc is a eslint SourceLocation object
    //   for the given branch
    // example:
    //   funcInfoStack = [ { branchIDStack: [ 's1_1' ],
    //       branchInfoMap:
    //        { s1_1:
    //           { good: false,
    //             loc: <loc> } } },
    //     { branchIDStack: ['s2_1', 's2_4'],
    //       branchInfoMap:
    //        { s2_1:
    //           { good: false,
    //             loc: <loc> },
    //          s2_2:
    //           { good: true,
    //             loc: <loc> },
    //          s2_4:
    //           { good: false,
    //             loc: <loc> } } } ]
    var funcInfoStack = []

    function markCurrentBranchAsGood () {
      var funcInfo = peek(funcInfoStack)
      var currentBranchID = peek(funcInfo.branchIDStack)
      funcInfo.branchInfoMap[currentBranchID].good = true
    }

    return {
      ReturnStatement: markCurrentBranchAsGood,
      ThrowStatement: markCurrentBranchAsGood,

      onCodePathSegmentStart: function (segment, node) {
        var funcInfo = peek(funcInfoStack)
        funcInfo.branchIDStack.push(segment.id)
        funcInfo.branchInfoMap[segment.id] = {good: false, loc: node.loc}
      },

      onCodePathSegmentEnd: function (segment, node) {
        var funcInfo = peek(funcInfoStack)
        funcInfo.branchIDStack.pop()
      },

      onCodePathStart: function (path, node) {
        funcInfoStack.push({
          branchIDStack: [],
          branchInfoMap: {}
        })
      },

      onCodePathEnd: function (path, node) {
        var funcInfo = funcInfoStack.pop()

        if (!isInlineThenFunctionExpression(node)) {
          return
        }

        var finalBranchIDs = path.finalSegments.map(x => x.id)
        finalBranchIDs.forEach((id) => {
          var branch = funcInfo.branchInfoMap[id]
          if (!branch.good) {
            context.report({
              message: 'Each then() should return a value or throw',
              loc: branch.loc
            })
          }
        })
      }
    }
  }
}
