/**
 * @file Validates JSDoc comments are syntactically correct
 * @author Nicholas C. Zakas
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var doctrine = require('doctrine2');

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = function(context) {

    var options = context.options[0] || {};
    var prefer = options.prefer || {};

    // these both default to true, so you have to explicitly make them false
    var requireReturn = options.requireReturn !== false;
    var requireParamDescription = options.requireParamDescription !== false;

    //--------------------------------------------------------------------------
    // Helpers
    //--------------------------------------------------------------------------

    // Using a stack to store if a function returns or not (handling nested functions)
    var fns = [];

    /**
     * When parsing a new function, store it in our function stack.
     * @return {void}
     * @private
     */
    function startFunction() {
        fns.push({returnPresent: false});
    }

    /**
     * Indicate that return has been found in the current function.
     * @param {ASTNode} node The return node.
     * @return {void}
     * @private
     */
    function addReturn(node) {
        var functionState = fns[fns.length - 1];

        if (functionState && node.argument !== null) {
            functionState.returnPresent = true;
        }
    }

    /**
     * Validate the JSDoc node and output warnings if anything is wrong.
     * @param {ASTNode} node The AST node to check.
     * @return {void}
     * @private
     */
    function checkJSDoc(node) {
        var jsdocNode = context.getJSDocComment(node);
        var functionData = fns.pop();
        var hasReturns = false;
        var hasConstructor = false;
        var params = Object.create(null);
        var jsdoc;
        var startLine;
        var startColumn;
        var lines;

        // make sure only to validate JSDoc comments
        if (jsdocNode) {

            try {
                jsdoc = doctrine.parse(
                    jsdocNode.value.replace(/module:/g, ''),
                    {
                        strict: true,
                        unwrap: true,
                        sloppy: true,
                        lineNumbers: true
                    }
                );

                startLine = jsdocNode.loc.start.line;
                startColumn = jsdocNode.loc.start.column + 1;
                lines = jsdocNode.value.split(/\n/);
            }
            catch (ex) {

                if (/braces/i.test(ex.message)) {
                    context.report(
                        jsdocNode,
                        'JSDoc type missing brace.'
                    );
                }
                else {
                    context.report(
                        jsdocNode,
                        'JSDoc syntax error.'
                    );
                }

                return;
            }

            jsdoc.tags.forEach(function(tag) {

                switch (tag.title) {

                    case 'param':
                        if (!tag.type) {
                            context.report(
                                jsdocNode,
                                {line: startLine + tag.lineNumber},
                                'Missing JSDoc parameter type for "{{name}}".',
                                {name: tag.name}
                            );
                        }

                        if (!tag.description && requireParamDescription) {
                            context.report(
                                jsdocNode,
                                {line: startLine + tag.lineNumber},
                                'Missing JSDoc parameter description for "{{name}}".',
                                {name: tag.name}
                            );
                        }

                        if (params[tag.name]) {
                            context.report(
                                jsdocNode,
                                {line: startLine + tag.lineNumber},
                                'Duplicate JSDoc parameter "{{name}}".',
                                {name: tag.name}
                            );
                        }
                        else if (tag.name.indexOf('.') === - 1) {
                            params[tag.name] = tag;
                        }
                        break;

                    case 'return':
                    case 'returns':
                        hasReturns = true;

                        if (!requireReturn
                            && !functionData.returnPresent
                            && tag.type.name !== 'void'
                            && tag.type.name !== 'undefined'
                        ) {
                            context.report(
                                jsdocNode,
                                {line: startLine + tag.lineNumber},
                                'Unexpected @' + tag.title + ' tag; function has no return statement.'
                            );
                        }
                        else {
                            if (!tag.type) {
                                context.report(
                                    jsdocNode,
                                    {line: startLine + tag.lineNumber},
                                    'Missing JSDoc return type.'
                                );
                            }

                            if (tag.type.name !== 'void' && !tag.description) {
                                context.report(
                                    jsdocNode,
                                    {line: startLine + tag.lineNumber},
                                    'Missing JSDoc return description.'
                                );
                            }
                        }

                        break;

                    case 'constructor':
                        hasConstructor = true;
                        break;

                    // no default
                }

                // check tag preferences
                if (prefer.hasOwnProperty(tag.title)) {
                    context.report(
                        jsdocNode,
                        {line: startLine + tag.lineNumber},
                        'Use @{{name}} instead.',
                        {name: prefer[tag.title]}
                    );
                }

                var type = tag.type;
                if (type) {
                    var map = {
                        'string': 'string',
                        'boolean': 'boolean',
                        'number': 'number',
                        'int': 'number',
                        'array': 'Array',
                        'function': 'Function',
                        'date': 'Date',
                        'object': 'Object',
                        'regexp': 'RegExp'
                    };
                    var perferName;

                    switch (type.type) {
                        case 'NameExpression':
                            perferName = map[type.name.toLowerCase()];
                            if (perferName && type.name !== perferName) {
                                context.report(
                                    jsdocNode,
                                    {
                                        line: startLine + tag.lineNumber,
                                        column: startColumn + lines[tag.lineNumber].indexOf(type.name)
                                    },
                                    'Expected JSDoc type name "{{name}}" but found "{{jsdocName}}".',
                                    {
                                        name: perferName,
                                        jsdocName: type.name
                                    }
                                );
                            }
                            break;
                    }
                }

            });

            // check for functions missing @returns
            if (!hasReturns && !hasConstructor) {
                if (requireReturn || functionData.returnPresent) {
                    context.report(
                        jsdocNode,
                        'Missing JSDoc @return for function.'
                    );
                }
            }

            // check the parameters
            var jsdocParams = Object.keys(params);

            node.params.forEach(function(param, i) {
                var name = param.name;

                if (jsdocParams[i] && (name !== jsdocParams[i])) {
                    context.report(
                        jsdocNode,
                        {line: startLine + jsdocParams[i].lineNumber},
                        'Expected JSDoc for "{{name}}" but found "{{jsdocName}}".',
                        {
                            name: name,
                            jsdocName: jsdocParams[i]
                        }
                    );
                }
                else if (!params[name]) {
                    context.report(
                        jsdocNode,
                        'Missing JSDoc for parameter "{{name}}".',
                        {name: name}
                    );
                }
            });

        }

    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    return {
        'FunctionExpression': startFunction,
        'FunctionDeclaration': startFunction,
        'FunctionExpression:exit': checkJSDoc,
        'FunctionDeclaration:exit': checkJSDoc,
        'ReturnStatement': addReturn
    };

};