import { requeteGraphQL } from './gql.js'

export async function envoyerMail(variables) {
    const query = `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelierdusappey@gmail.com"
                    to: $email
                    templateId: "d-08bb9e1b96ac4d56a9210660cac6cd07"
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.insert_reservationMachines
        })
}