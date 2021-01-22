#!/usr/bin/env node

const v = require('validator');
const AWS = require('aws-sdk');

var db = null;    //  DynamoDB document client
var errors = [];  //  Validation errors

const validator = {
    async email(key, value) {
        const valid = v.isEmail(value);

        if (valid) return true;

        errors.push({
            rule: 'email',
            key: key,
            value: value,
            error: `The ${key} attribute must be a valid email.`
        })
    },
    async equals(key, value, param) {
        const valid = value === param;

        if (valid) return true

        errors.push({
            rule: 'exists',
            key: key,
            value: value,
            param: param,
            error: `The ${key} attribute must equal ${param}.`
        })
    },
    async exists(key, value, param) {

        //  Extract the table name and tenant_id from the validation param
        let q = param.split(',');
        const table = q[0];
        const tenant_id = q[1];

        //  Assemble the dynamodb query
        const query = {
            TableName: table,
            AttributesToGet: [key],
            Key: {
                "tenant_id": tenant_id,
                [key]: value
            }
        };

        //  Fetch the contact from dynamo
        const contact = await db.get(query).promise();

        //  Validate the value
        const valid = contact !== null && contact !== undefined && Object.keys(contact).length > 0;

        //  If the the value is valid, return true
        if (valid) return true;

        //  Else, push the error
        errors.push({
            rule: 'exists',
            key: key,
            value: value,
            param: param,
            error: `The ${key} does not exist.`
        })

        //  Validation fails
        return false;
    },
    async max(key, value, param) {
        let valid = true;

        //  Validate the value
        if (value) valid = v.isLength(value, { max: param });

        //  If the value is valid, return true
        if (valid) return true

        //  Push the error to errors
        errors.push({
            rule: 'max',
            key: key,
            value: value,
            param: param,
            error: `The ${key} has a max length of ${param}`
        })

        //  Validate failed, so return false
        return false;
    },
    async null(key, value) {
        const valid = value === null || value === undefined;

        if (valid) return true;

        errors.push({
            rule: 'null',
            key: key,
            value: value,
            error: `The ${key} attribute must be null.`
        })

        return false;
    },
    async required(key, value) {
        //  Validate the value
        const valid = value !== null && value !== undefined;

        //  If the value id valid, return true
        if (valid) return true;

        //  Else, push the error
        errors.push({
            rule: 'required',
            key: key,
            value: value,
            error: `The ${key} attribute is required`
        });

        //  Validation fails
        return false;
    },
    async unique(key, value, param) {
        if (value) {
            //  Extract the table name and tenant_id from the validation param
            let q = param.split(',');
            const table = q[0];
            const column = q[1];

            //  Assemble the dynamodb query
            const query = {
                TableName: table,
                AttributesToGet: [key],
                Key: {
                    [column]: value
                }
            };

            //  Fetch the item from dynamo
            const item = await db.get(query).promise();

            //  Validate the item
            const valid = item === null || item === undefined || Object.keys(item).length === 0;

            //  If the the value is valid, return true
            if (valid) return true;
        }

        //  Push the error
        errors.push({
            rule: 'unique',
            key: key,
            value: value,
            param: param,
            error: `The ${key} attribute already exists.`
        })

        //  Validation fails
        return false;
    }
}

exports.init = (options) => {
    AWS.config.update({
        region: 'us-west-2',
        'accessKeyId': options.clientID,
        'secretAccessKey': options.clientSecret
    });

    db = new AWS.DynamoDB.DocumentClient();
}

exports.validate = async (data, rules) => {
    //  Reset errors
    errors = [];

    //  Validate each key value in the object
    for (const [key, value] of Object.entries(rules)) {

        //  Convert the rules string into an array of rules
        const rules = value.split("|");

        //  Process each rule
        for (let rule of rules) {

            //  Extract the validation parameters by spliting ':'
            const r = rule.split(':');
            rule = r[0];
            param = r[1] || null;

            //  Validate the value
            await validator[rule](key, data[key], param);
        }
    }

    //  Return the validation result
    return {
        valid: errors.length === 0,
        errors: errors
    }
}
